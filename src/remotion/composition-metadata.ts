// remotion/composition-metadata.ts
// Single source of truth for the spread-video composition's dimensions, fps and
// duration. Shared by BOTH the registered Root (worker render via bundle()) AND the
// demo page <Player> — so preview === output by construction. Changing these here
// changes both sides at once; never duplicate the duration formula.

import type { PlayableSpread } from "@/types/playable-types";
import { linearizeSpreadTimeline } from "@/features/editor/components/playable-spread-view/linearize-spread-timeline";

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
 */
export function getSpreadTotalSec(spread: PlayableSpread): number {
  const { totalSec } = linearizeSpreadTimeline(spread.animations);
  return totalSec;
}

/**
 * durationInFrames for a spread. Floor of 1 frame so an animation-less spread still
 * produces a valid (1-frame) composition instead of crashing Remotion.
 */
export function getSpreadDurationInFrames(spread: PlayableSpread, fps = VIDEO_FPS): number {
  const totalSec = getSpreadTotalSec(spread);
  return Math.max(1, Math.ceil((totalSec + DURATION_PAD_SEC) * fps));
}

/** Composition id — referenced by selectComposition() in the worker. */
export const SPREAD_COMPOSITION_ID = "spread-video";
