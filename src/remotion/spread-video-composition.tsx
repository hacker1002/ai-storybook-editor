// remotion/spread-video-composition.tsx — the render-mode entry for the shared
// player render core (ADR-035). Drives the SAME PlayerSpreadStage + the SAME
// buildMasterTimeline as the live player, but via a FrameSeek clock
// (tl.seek(frame/fps)) instead of wall-clock playback ⇒ preview === output by
// construction.
//
//   • mode:'render' → quiz = timing spacer (no pause), PLAY/READ_ALONG = spacer
//     (audio is declarative <Audio>; read-along highlight is frame-derived).
//   • media leaves are Remotion primitives (Img / OffthreadVideo / ThorVG lottie)
//     via createRenderStageRenderers — geometry/z-index identical to live.

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import gsap from "gsap";
import type { PlayableSpread } from "@/types/playable-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import { applyInitialStates } from "@/features/editor/components/playable-spread-view/player-initial-states";
import { buildMasterTimeline } from "@/features/editor/components/playable-spread-view/build-master-timeline";
import { linearizeSpreadTimeline } from "@/features/editor/components/playable-spread-view/linearize-spread-timeline";
import { PlayerSpreadStage } from "@/features/editor/components/playable-spread-view/player-spread-stage";
import type { SpreadTextbox, SpreadTextboxContent } from "@/types/spread-types";
import { createLogger } from "@/utils/logger";
import { deriveActiveWords } from "./derive-active-words";
import { createRenderStageRenderers } from "./render-stage-renderers";

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

  // registerRef grabs the wrapper's firstElementChild (the positioned visual) so
  // GSAP drives the geometry-bearing element — identical to the live engine's
  // registerRef, so the SAME tweens produce the SAME transforms.
  const registerRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) {
        const visualChild = el.firstElementChild as HTMLElement;
        refsMapRef.current.set(id, visualChild ?? el);
      } else {
        refsMapRef.current.delete(id);
      }
    },
    []
  );

  // ── Build the master timeline once per spread (paused). Runs after DOM commit
  // so item refs are populated. Caller owns applyInitialStates (entrance items →
  // offscreen anchors); buildMasterTimeline appends each tween. ──
  useLayoutEffect(() => {
    const container = containerRef.current;
    const refsMap = refsMapRef.current;
    if (!container) return;

    gsap.ticker.lagSmoothing(0);
    applyInitialStates(spread.animations, refsMap, container, { width, height }, spread, "interactive");

    const geoLookup = buildGeometryLookup(spread, language);
    const tl = buildMasterTimeline({
      animations: spread.animations,
      refsMap,
      container,
      containerWidth: width,
      containerHeight: height,
      canvasWidth: width,
      canvasHeight: height,
      composites: spread.composites,
      textboxes: spread.textboxes,
      audios: spread.audios,
      narrationLangCode: language,
      playEdition: "interactive",
      findItemGeometry: (id) => geoLookup.get(id),
      mode: "render",
    });

    timelineRef.current = tl;
    log.info("buildTimeline", "render master timeline built", {
      spreadId: spread.id,
      gsapSec: Math.round(tl.duration() * 100) / 100,
    });

    return () => {
      tl.kill();
      timelineRef.current = null;
    };
  }, [spread, language, width, height]);

  // ── Drive the timeline from the frame clock (FrameSeekDriver). ──
  useLayoutEffect(() => {
    const tl = timelineRef.current;
    if (tl) tl.seek(frame / fps);
  }, [frame, fps]);

  // ── Declarative audio (render-mode replacement for PLAY/READ_ALONG side-effects). ──
  const audioSequences = useMemo(() => {
    const { steps } = linearizeSpreadTimeline(spread.animations);
    const textboxes = (spread.textboxes ?? []) as SpreadTextbox[];
    const tbContent = (id: string): SpreadTextboxContent | undefined => {
      const c = textboxes.find((t) => t.id === id)?.[language];
      return c && typeof c === "object" && "text" in c ? (c as SpreadTextboxContent) : undefined;
    };
    const audioById = new Map((spread.audios ?? []).map((a) => [a.id, a]));
    return steps
      .filter((s) => s.isMedia)
      .map((s) => {
        let url: string | null | undefined;
        if (s.anim.target.type === "audio") {
          url = audioById.get(s.anim.target.id)?.media_url;
        } else if (
          s.anim.effect.type === EFFECT_TYPE.READ_ALONG &&
          s.anim.target.type === "textbox"
        ) {
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
  }, [spread, language, fps]);

  // ── Frame-derived read-along highlight → injected into the render textbox renderer. ──
  const activeWordByTextbox = deriveActiveWords(frame, spread, fps, language);
  const renderers = createRenderStageRenderers(activeWordByTextbox);

  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff" }}>
      <AbsoluteFill ref={containerRef} style={{ position: "relative", overflow: "hidden" }}>
        <PlayerSpreadStage
          spread={spread}
          narrationLangCode={language}
          playEdition="interactive"
          registerRef={registerRef}
          renderers={renderers}
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
