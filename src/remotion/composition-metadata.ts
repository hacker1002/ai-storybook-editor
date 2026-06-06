// remotion/composition-metadata.ts
// Single source of truth for the spread-video composition's dimensions, fps and
// duration. Shared by BOTH the registered Root (worker render via bundle()) AND the
// demo page <Player> — so preview === output by construction. Changing these here
// changes both sides at once; never duplicate the duration formula.

import type { PlayableSpread, PlayEdition } from "@/types/playable-types";
import { linearizeSpreadTimeline } from "@/features/editor/components/playable-spread-view/linearize-spread-timeline";
import { filterAnimationsForEdition } from "@/features/editor/components/playable-spread-view/player-utils";

/** Output frame rate. 30fps canonical (matches ADR-034). Halves per-frame ThorVG seeks
 *  vs the earlier experimental 60 → lower per-frame-gate cost / timeout risk on long spreads. */
export const VIDEO_FPS = 30;

/**
 * Output dimensions = 1440p at the spreads' native 4:3 ratio (1920×1440).
 * Validation S1 follow-up: spread content is authored 4:3; rendering into 16:9
 * (2560×1440) would horizontally stretch %-positioned items and break
 * preview===output. 4:3 keeps geometry faithful.
 */
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1440;

/**
 * Tail padding (seconds) appended after the last animation so the final tween/audio
 * isn't clipped. Mirrors the demo player's pad — kept identical for parity.
 */
export const DURATION_PAD_SEC = 2;

/**
 * Total animated seconds of a spread, derived from the linearized timeline.
 * Pure function → safe to call in calculateMetadata and in render bodies.
 *
 * `edition` MUST match what BookSpreadCore renders (filtered animations) or the
 * settle hold drifts — classic only counts read-along, so its segment is far
 * shorter than dynamic. Defaults to `interactive` (full timeline) for the
 * single-spread demo composition which is edition-agnostic.
 */
export function getSpreadTotalSec(
  spread: PlayableSpread,
  edition: PlayEdition = "interactive"
): number {
  const animations = filterAnimationsForEdition(spread.animations ?? [], edition);
  const { totalSec } = linearizeSpreadTimeline(animations);
  return totalSec;
}

/**
 * durationInFrames for a spread. Floor of 1 frame so an animation-less spread still
 * produces a valid (1-frame) composition instead of crashing Remotion.
 */
export function getSpreadDurationInFrames(
  spread: PlayableSpread,
  fps = VIDEO_FPS,
  edition: PlayEdition = "interactive"
): number {
  const totalSec = getSpreadTotalSec(spread, edition);
  return Math.max(1, Math.ceil((totalSec + DURATION_PAD_SEC) * fps));
}

/** Composition id — referenced by selectComposition() in the worker. */
export const SPREAD_COMPOSITION_ID = "spread-video";

// ── Full-book render (mega-composition) — design 06-book-render.md §2-3 ──────────

/** Composition id for the full-book mega-composition (phase 02). */
export const BOOK_COMPOSITION_ID = "book-video";

/**
 * Output resolution presets at the spreads' native 4:3 ratio (see VIDEO_WIDTH /
 * VIDEO_HEIGHT rationale above — rendering 16:9 would stretch %-positioned items).
 *
 * `qhd` = the book QHD master = 1920×1440 (4:3, matches VIDEO_WIDTH/VIDEO_HEIGHT
 * and the image-api handler's _QHD_WIDTH/_QHD_HEIGHT fallback). Frozen contract:
 * worker renders at 1920×1440 and returns width:1920, height:1440 in the response.
 * Note: this is NOT the conventional 2560×1440 QHD — it is the book-native 4:3
 * canvas dimension used as the "high quality" export tier (see design 06 §3).
 * `fhd` is a future downscale transcode target (below-native).
 */
export const RESOLUTION_DIMS = {
  qhd: { width: 1920, height: 1440 },
  fhd: { width: 1920, height: 1440 },
  hd: { width: 1280, height: 960 },
  sd: { width: 640, height: 480 },
} as const;

export type ResolutionKey = keyof typeof RESOLUTION_DIMS;

/**
 * Seconds the last animated frame of a spread is held before flipping — mirrors
 * the player's `AUTO_SPREAD_COMPLETE_DELAY = 1000ms` (handleSpreadComplete setTimeout).
 */
export const AUTO_SPREAD_SETTLE_SEC = 1.0;

/**
 * Page-turn transition duration in seconds — mirrors the player's
 * `DEFAULT_TURN_DURATION_MS = 900` (spread-turn-constants / spread-flip-transform).
 */
export const TRANSITION_SEC = 0.9;

/** Tail pad appended after the last spread — reuses the single-spread `DURATION_PAD_SEC`. */
export const END_PAD_SEC = DURATION_PAD_SEC;

/** Hard cap on book playlist length — defends the walker against malformed data. */
export const MAX_BOOK_SPREADS = 500;

/** Number of spreads rendered per Remotion frameRange chunk (slice + ffmpeg concat). */
export const CHUNK_SPREADS = 5;

/** Per-chunk render retry budget before failing the book render. */
export const CHUNK_RETRY = 2;

/**
 * Minimal book-sequence shape `getBookDurationInFrames` needs. Kept structural
 * (not importing `BookSequence` from resolve-book-sequence) to avoid a cycle —
 * resolve-book-sequence imports `MAX_BOOK_SPREADS` from this module.
 */
export interface BookDurationSequence {
  ordered: ReadonlyArray<{
    spread: PlayableSpread;
    turnToNext: 'next' | null;
  }>;
}

/**
 * durationInFrames for the whole book mega-composition. Pure → callable from
 * `calculateMetadata` (mirrors `getSpreadDurationInFrames`). Design 06 §3:
 *
 *   Σ_i (animFrames_i + settleFrames)
 *   + Σ_{i | turnToNext==='next'} transitionFrames
 *   + endPadFrames
 *
 * No overlap-subtraction (segments are sequential `<Sequence>`s, not overlapped).
 * Floor of 1 frame so an empty book still yields a valid composition.
 */
export function getBookDurationInFrames(
  sequence: BookDurationSequence,
  fps = VIDEO_FPS,
  edition: PlayEdition = "interactive",
): number {
  const settleFrames = Math.round(AUTO_SPREAD_SETTLE_SEC * fps);
  const transitionFrames = Math.round(TRANSITION_SEC * fps);
  const endPadFrames = Math.round(END_PAD_SEC * fps);

  let total = 0;
  for (const item of sequence.ordered) {
    const animFrames = Math.ceil(getSpreadTotalSec(item.spread, edition) * fps);
    total += animFrames + settleFrames;
    if (item.turnToNext === 'next') total += transitionFrames;
  }
  total += endPadFrames;

  return Math.max(1, total);
}
