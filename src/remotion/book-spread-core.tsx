// remotion/book-spread-core.tsx — the shared, clock-explicit spread render core.
//
// Extracted from SpreadVideoComposition (ADR-035) so BOTH the single-spread
// composition AND the full-book mega-composition (phase 02) drive the SAME
// PlayerSpreadStage + SAME buildMasterTimeline. The ONLY difference between
// callers is HOW they compute the GSAP seek time and the read-along reference
// frame — so this core takes them as explicit props instead of reading the
// global `useCurrentFrame()`:
//
//   • single-spread / spread-segment → seekSec = localFrame/fps (+ settle clamp)
//   • turn-segment (flip)            → seekSec = a FROZEN constant (no animation)
//
// IMPORTANT: this core renders ONLY the visual stage (no <Audio>). Audio is
// emitted by the *caller* (single-spread comp keeps its own audio; the book
// composition emits per-spread audio at book-level frame offsets). Keeping audio
// out of the core is what lets the flip's two frozen stages stay SILENT.

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import gsap from "gsap";
import type { PlayableSpread } from "@/types/playable-types";
import { applyInitialStates } from "@/features/editor/components/playable-spread-view/player-initial-states";
import { buildMasterTimeline } from "@/features/editor/components/playable-spread-view/build-master-timeline";
import { linearizeSpreadTimeline } from "@/features/editor/components/playable-spread-view/linearize-spread-timeline";
import { PlayerSpreadStage } from "@/features/editor/components/playable-spread-view/player-spread-stage";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import type { RemixLanguageCode } from "@/types/editor";
import { createLogger } from "@/utils/logger";
import { deriveActiveWords } from "./derive-active-words";
import { createRenderStageRenderers } from "./render-stage-renderers";

const log = createLogger("Demo", "BookSpreadCore");

/** Editor default canvas width (DEFAULT_CANVAS_SIZE.width) — fallback when the
 *  caller doesn't supply the design canvas size the spread was authored against. */
export const DEFAULT_DESIGN_CANVAS_WIDTH = 800;

export interface BookSpreadCoreProps {
  spread: PlayableSpread;
  language: RemixLanguageCode;
  /** Design-canvas width the spread was authored against (font/border scale). */
  canvasWidth?: number;
  /**
   * Explicit GSAP timeline seek time in seconds. Caller derives it from its own
   * clock so this core never reads the global frame:
   *   - spread-segment: localFrame/fps clamped to totalSec (settle hold)
   *   - turn-segment: a frozen constant (totalSec_i for the front, 0 for the back)
   */
  seekSec: number;
  /**
   * Reference frame for the frame-derived read-along word highlight. Passed
   * explicitly so a frozen flip face highlights the word at its frozen seek time.
   * (Equivalent to round(seekSec*fps) but kept separate so the live single-spread
   * comp can pass the true composition frame unchanged.)
   */
  wordFrame: number;
}

/** Build a (target id → geometry) lookup so LINES/Arcs deltas resolve correctly. */
function buildGeometryLookup(
  spread: PlayableSpread,
  language: RemixLanguageCode
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

/**
 * Video PLAY-start frames (videoId → frame) — render video renderer gates
 * <OffthreadVideo> to start there. For a FROZEN core these are still computed
 * relative to the spread's own timeline (caller's seek decides what's on screen).
 */
function useVideoStartByItem(
  spread: PlayableSpread,
  fps: number
): Record<string, number> {
  return useMemo(() => {
    const { steps } = linearizeSpreadTimeline(spread.animations);
    const map: Record<string, number> = {};
    for (const s of steps) {
      if (s.anim.effect.type === EFFECT_TYPE.PLAY && s.anim.target.type === "video") {
        map[s.anim.target.id] = Math.max(0, Math.round(s.startSec * fps));
      }
    }
    return map;
  }, [spread, fps]);
}

/**
 * The shared spread visual stage, driven by an EXPLICIT seek time. No <Audio>
 * here — the caller owns audio sequencing.
 */
export function BookSpreadCore({
  spread,
  language,
  canvasWidth = DEFAULT_DESIGN_CANVAS_WIDTH,
  seekSec,
  wordFrame,
}: BookSpreadCoreProps) {
  const { width, height, fps } = useVideoConfig();
  const fontScale = width / (canvasWidth || DEFAULT_DESIGN_CANVAS_WIDTH);

  const containerRef = useRef<HTMLDivElement>(null);
  const refsMapRef = useRef<Map<string, HTMLElement>>(new Map());
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

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

  // ── Build the master timeline once per spread (paused). Scoped to THIS core's
  // refs — each <Sequence> mounts its own core so GSAP refs never collide across
  // segments (phase-02 risk: multi-stage timeline ref collision). ──
  useLayoutEffect(() => {
    const container = containerRef.current;
    const refsMap = refsMapRef.current;
    if (!container) return;

    gsap.ticker.lagSmoothing(0);
    const spreadAnimations = spread.animations ?? [];
    applyInitialStates(spreadAnimations, refsMap, container, { width, height }, spread, "interactive");

    const geoLookup = buildGeometryLookup(spread, language);
    const tl = buildMasterTimeline({
      animations: spreadAnimations,
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

  // ── Drive the timeline from the EXPLICIT seek time (frozen for flip faces). ──
  useLayoutEffect(() => {
    const tl = timelineRef.current;
    if (tl) tl.seek(seekSec);
  }, [seekSec]);

  const videoStartByItem = useVideoStartByItem(spread, fps);
  const activeWordByTextbox = deriveActiveWords(wordFrame, spread, fps, language);
  const renderers = createRenderStageRenderers(activeWordByTextbox, fontScale, videoStartByItem);

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
    </AbsoluteFill>
  );
}
