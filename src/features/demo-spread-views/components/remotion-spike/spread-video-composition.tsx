// components/remotion-spike/spread-video-composition.tsx
// The de-risk core: render one spread, build a master GSAP timeline (paused) by
// REUSING the player's real tween builders (animation-tween-builders), then drive
// it purely from Remotion's frame clock via tl.seek(frame/fps). If scrubbing the
// Remotion timeline reproduces the player's motion, the GSAP-seek hypothesis holds
// and Remotion is viable for video export.
//
// Audio is re-emitted declaratively as Remotion <Audio> (frame-positioned) — the
// render-mode replacement for the player's HTMLMediaElement.play() side-effects,
// which are not seek-safe.

import { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import gsap from "gsap";
import type { PlayableSpread } from "@/types/playable-types";
import type { SpreadAnimation, SpreadTextbox, SpreadTextboxContent } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import { applyInitialStates } from "@/features/editor/components/playable-spread-view/player-initial-states";
import { addTweenToTimeline } from "@/features/editor/components/playable-spread-view/animation-tween-builders";
import { createLogger } from "@/utils/logger";
import { SpreadItemLayer } from "./spread-item-layer";
import { linearizeSpreadTimeline } from "../../utils/linearize-spread-timeline";

const log = createLogger("Demo", "RemotionSpreadComposition");

// Type alias (not interface): Remotion's <Composition> requires props to satisfy
// `Record<string, unknown>`, which interfaces don't (no implicit index signature).
export type SpreadVideoCompositionProps = {
  spread: PlayableSpread;
  language: "en_US" | "vi_VN";
};

/** Build a (target id → geometry) lookup so LINES/Arcs deltas resolve correctly. */
function buildGeometryLookup(
  spread: PlayableSpread,
  language: "en_US" | "vi_VN"
): Map<string, { x: number; y: number }> {
  const map = new Map<string, { x: number; y: number }>();
  (spread.images ?? []).forEach((i) => map.set(i.id, { x: i.geometry.x, y: i.geometry.y }));
  (spread.shapes ?? []).forEach((s) => map.set(s.id, { x: s.geometry.x, y: s.geometry.y }));
  (spread.videos ?? []).forEach((v) => map.set(v.id, { x: v.geometry.x, y: v.geometry.y }));
  (spread.auto_pics ?? []).forEach((a) => map.set(a.id, { x: a.geometry.x, y: a.geometry.y }));
  (spread.textboxes ?? []).forEach((tb) => {
    const c = tb[language];
    if (c && typeof c === "object" && "geometry" in c) {
      map.set(tb.id, { x: c.geometry.x, y: c.geometry.y });
    }
  });
  return map;
}

export function SpreadVideoComposition({ spread, language }: SpreadVideoCompositionProps) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const containerRef = useRef<HTMLDivElement>(null);
  const refsMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  // ── Build the master timeline once per spread (paused). ──
  // Runs after DOM commit so item refs are populated. applyInitialStates() puts
  // entrance items at their offscreen/hidden anchors; addTweenToTimeline() appends
  // each effect at its linearized position. PLAY/READ_ALONG → pure duration spacer
  // (their real side-effects are not seek-safe).
  useLayoutEffect(() => {
    const container = containerRef.current;
    const refsMap = refsMapRef.current;
    if (!container) return;

    const canvasSize = { width, height };
    gsap.ticker.lagSmoothing(0);

    const tl = gsap.timeline({ paused: true });
    applyInitialStates(spread.animations, refsMap, container, canvasSize, spread, "interactive");

    const geoLookup = buildGeometryLookup(spread, language);
    const { steps, totalSec } = linearizeSpreadTimeline(spread.animations);

    let skippedNoEl = 0;
    for (const step of steps) {
      if (step.isMedia) {
        // Seek-safe duration spacer — preserves chained timing without audio/video side-effects.
        if (step.durationSec > 0) {
          tl.to({}, { duration: step.durationSec }, step.position);
        }
        continue;
      }
      const anim: SpreadAnimation = step.anim;
      const el = refsMap.get(anim.target.id);
      if (!el) {
        skippedNoEl += 1;
        continue;
      }
      addTweenToTimeline(tl, anim, el, step.position, {
        spreadContainer: container,
        containerWidth: width,
        containerHeight: height,
        canvasWidth: width,
        canvasHeight: height,
        itemGeometry: geoLookup.get(anim.target.id),
      });
    }

    timelineRef.current = tl;
    log.info("buildTimeline", "master timeline built", {
      spreadId: spread.id,
      steps: steps.length,
      skippedNoEl,
      analyticSec: Math.round(totalSec * 100) / 100,
      gsapSec: Math.round(tl.duration() * 100) / 100,
    });

    return () => {
      tl.kill();
      timelineRef.current = null;
    };
  }, [spread, language, width, height]);

  // ── Drive the timeline from the frame clock. ──
  // Pure function of frame → fully deterministic, scrub-safe.
  useLayoutEffect(() => {
    const tl = timelineRef.current;
    if (tl) tl.seek(frame / fps);
  }, [frame, fps]);

  const { steps } = linearizeSpreadTimeline(spread.animations);
  const textboxes = (spread.textboxes ?? []) as SpreadTextbox[];
  const tbContent = (id: string): SpreadTextboxContent | undefined => {
    const c = textboxes.find((t) => t.id === id)?.[language];
    return c && typeof c === "object" && "text" in c ? (c as SpreadTextboxContent) : undefined;
  };

  // ── Declarative audio (render-mode replacement for PLAY/READ_ALONG side-effects). ──
  // PLAY → audio item media_url; READ_ALONG → textbox combined_audio_url. Both
  // positioned at the step's linearized startSec.
  const audioById = new Map((spread.audios ?? []).map((a) => [a.id, a]));
  const audioSequences = steps
    .filter((s) => s.isMedia)
    .map((s) => {
      let url: string | null | undefined;
      if (s.anim.target.type === "audio") {
        url = audioById.get(s.anim.target.id)?.media_url;
      } else if (s.anim.effect.type === EFFECT_TYPE.READ_ALONG && s.anim.target.type === "textbox") {
        url = tbContent(s.anim.target.id)?.audio?.combined_audio_url;
      }
      if (!url) return null;
      return {
        key: `${s.anim.target.id}-${s.startSec}`,
        from: Math.max(0, Math.round(s.startSec * fps)),
        url,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // ── Frame-driven read-along word highlight (replaces audio.currentTime polling). ──
  // word_timings are relative to the narration audio start = READ_ALONG startSec.
  // Active word = latest word whose startMs has elapsed; cleared after the last word ends.
  const activeWordByTextbox: Record<string, number> = {};
  for (const s of steps) {
    if (s.anim.effect.type !== EFFECT_TYPE.READ_ALONG || s.anim.target.type !== "textbox") continue;
    const wts = tbContent(s.anim.target.id)?.audio?.word_timings;
    if (!wts?.length) continue;
    const relMs = (frame / fps - s.startSec) * 1000;
    let idx = -1;
    if (relMs >= 0 && relMs <= wts[wts.length - 1].endMs) {
      for (let i = 0; i < wts.length; i++) {
        if (relMs >= wts[i].startMs) idx = i;
        else break;
      }
    }
    activeWordByTextbox[s.anim.target.id] = idx;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff" }}>
      <AbsoluteFill
        ref={containerRef}
        style={{ position: "relative", overflow: "hidden" }}
      >
        <SpreadItemLayer
          spread={spread}
          language={language}
          refsMap={refsMapRef.current}
          activeWordByTextbox={activeWordByTextbox}
        />
      </AbsoluteFill>

      {audioSequences.map((a) => (
        <Sequence key={a.key} from={a.from}>
          <Audio src={a.url} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
