// play-clock.ts — clock seam contract for the shared player render core (ADR-035).
//
// The render core is clock-AGNOSTIC: one `PlayerSpreadStage` (DOM) + one
// `buildMasterTimeline` (GSAP, paused). A *driver* attaches to the paused
// timeline and advances it:
//   • live player  → WallClockDriver (tl.play / pause / resume on the rAF ticker)
//   • video render → FrameSeekDriver (tl.seek(frame/fps), deterministic)
// Sharing both = preview === output by construction.
//
// This module is INTERFACE-ONLY. WallClock impl lives in the GSAP engine
// (Phase 04); FrameSeek impl lives in the Remotion composition (Phase 03).

import type { PlayableSpread, PlayEdition } from "@/types/playable-types";
import type { SpreadAnimation } from "@/types/spread-types";

// LinearStep / LinearTimeline are owned by linearize-spread-timeline.ts (the
// analytic model); re-exported here so consumers import the whole seam from one
// place.
export type { LinearStep, LinearTimeline } from "./linearize-spread-timeline";

// ── Clock drivers ──────────────────────────────────────────────────────────

export type PlayClockMode = "wall-clock" | "frame-seek";

/** Base seam: a driver attaches to a paused master timeline and owns advancement. */
export interface PlayClock {
  readonly mode: PlayClockMode;
  attach(timeline: gsap.core.Timeline): void;
}

/** Live playback — wall-clock driven via GSAP's rAF ticker. */
export interface WallClockDriver extends PlayClock {
  readonly mode: "wall-clock";
  play(): void;
  pause(): void;
  resume(): void;
}

/** Video render — frame-seek driven; pure function of frame → fully deterministic. */
export interface FrameSeekDriver extends PlayClock {
  readonly mode: "frame-seek";
  seek(frame: number, fps: number): void;
}

// ── Stage media + interactivity seams ────────────────────────────────────────
// PlayerSpreadStage renders item DOM but injects media + interactivity so the
// same stage serves live (DOM <img>/<video>/rAF lottie + pointer/onClick) and
// render (Remotion <Img>/<OffthreadVideo>/ThorVG setFrame, no interaction).

export interface StageMediaProps {
  src: string;
  style?: React.CSSProperties;
}

export interface StageImageProps extends StageMediaProps {
  alt?: string;
  crossOrigin?: "anonymous" | "use-credentials" | "";
}

export interface StageLottieProps {
  src: string;
  /** dotLottie v2 options (theme / state-machine) — opaque to the stage. */
  options?: unknown;
  style?: React.CSSProperties;
}

/** Injected media component set — clock-specific (DOM tags vs Remotion primitives). */
export interface MediaRenderer {
  Image: React.ComponentType<StageImageProps>;
  Video: React.ComponentType<StageMediaProps>;
  Lottie: React.ComponentType<StageLottieProps>;
}

/** Live-only per-item interactive affordances. Render mode passes none. */
export interface ItemInteractivity {
  pointerEvents?: React.CSSProperties["pointerEvents"];
  /** Class toggled for the click-hint pulse / highlight. */
  highlightClassName?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
}

// ── buildMasterTimeline args ─────────────────────────────────────────────────

/** Per-animation GSAP lifecycle callbacks (live-auto wires store side-effects;
 *  render passes none). Mirrors the engine's `buildAnimCallbacks` return shape. */
export interface AnimTweenCallbacks {
  onTweenStart?: () => void;
  onTweenRepeat?: () => void;
  onTweenComplete?: () => void;
}

export type BuildMasterTimelineMode = "live-auto" | "render";

/**
 * Inputs for `buildMasterTimeline`. Behaviour-preserving extract of the live
 * `buildAndPlayFullTimeline` — position/pacing/quiz/camera logic is identical;
 * `mode` only toggles (a) quiz PLAY → addPause (live) vs duration spacer (render)
 * and (b) imperative side-effects (live) vs none (render — audio is declarative
 * <Audio>, read-along is frame-derived).
 *
 * NOTE: the caller owns `applyInitialStates` — live applies it in its own
 * mount/reset effects; render applies it before building. Keeping it OUT of the
 * builder is what makes live-auto byte-identical to the pre-refactor engine.
 */
export interface BuildMasterTimelineArgs {
  /** Already edition-filtered animations; builder sorts by `order`. */
  animations: SpreadAnimation[];
  /** Item id → mounted DOM element (= PlayerSpreadStage registerRef map). */
  refsMap: Map<string, HTMLElement>;
  container: HTMLElement | null;
  containerWidth: number;
  containerHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  composites: PlayableSpread["composites"];
  textboxes: PlayableSpread["textboxes"];
  audios: PlayableSpread["audios"];
  narrationLangCode: string;
  playEdition: PlayEdition;
  /** Lines/Arcs delta source (original item geometry). */
  findItemGeometry: (targetId: string) => { x: number; y: number } | undefined;
  mode: BuildMasterTimelineMode;
  /** Fired when the timeline reaches its end (live: onSpreadComplete). */
  onComplete?: () => void;

  // ── live-auto side-effect wiring (ignored in render mode) ──
  buildCallbacks?: (anim: SpreadAnimation) => AnimTweenCallbacks;
  onQuizPlay?: (quizId: string) => void;
  /** Toggle a quiz anim's active-order highlight (add on true, remove on false). */
  setQuizActiveOrder?: (order: number, active: boolean) => void;
}
