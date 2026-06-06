// remotion/book-segment-layout.ts — pure frame-axis layout for the full-book
// mega composition. Single source of truth for WHERE each spread-segment and
// turn-segment sits on the book frame axis, so the composition body, the audio
// offsets, AND plan-chunks (worker frameRange) all derive from ONE formula that
// matches `getBookDurationInFrames` exactly (no duration drift).
//
// Layout (design 06 §3-4):
//   [spread_0 | settle][turn_0→1][spread_1 | settle][turn_1→2]...[spread_N | settle][endPad]
//
// Per spread-segment length = animFrames_i + settleFrames.
// Per turn-segment length    = transitionFrames (only when turnToNext==='next').
// endPad is appended once after the last spread-segment.

import type { PlayableSpread, PlayEdition } from "@/types/playable-types";
import {
  AUTO_SPREAD_SETTLE_SEC,
  TRANSITION_SEC,
  END_PAD_SEC,
  VIDEO_FPS,
  getSpreadTotalSec,
} from "./composition-metadata";

/** One placed spread-segment on the frame axis. */
export interface SpreadSegmentPlacement {
  kind: "spread";
  spread: PlayableSpread;
  /** Index into the resolved sequence (ordered[]). */
  orderIndex: number;
  /** Absolute first frame of the segment. */
  startFrame: number;
  /** Number of frames the segment occupies (anim + settle). */
  durationFrames: number;
  /** Animation-only frames = ceil(totalSec*fps); beyond this is the settle hold. */
  animFrames: number;
  /** Total animated seconds (clamp ceiling for the settle hold). */
  totalSec: number;
}

/** One placed turn (flip) segment on the frame axis. */
export interface TurnSegmentPlacement {
  kind: "turn";
  fromSpread: PlayableSpread;
  toSpread: PlayableSpread;
  /** Index of the OUTGOING spread in the resolved sequence. */
  fromOrderIndex: number;
  startFrame: number;
  durationFrames: number;
  /** Front-face freeze seek time = outgoing spread totalSec. */
  fromTotalSec: number;
}

export type SegmentPlacement = SpreadSegmentPlacement | TurnSegmentPlacement;

/** Minimal sequence shape the layout needs (structural — avoids import cycle). */
export interface BookLayoutSequence {
  ordered: ReadonlyArray<{
    spread: PlayableSpread;
    turnToNext: "next" | null;
  }>;
}

export interface BookSegmentLayout {
  segments: SegmentPlacement[];
  /** Absolute frame the endPad begins at (== total - endPadFrames). */
  endPadStartFrame: number;
  /** Total composition frames — MUST equal getBookDurationInFrames(sequence). */
  totalFrames: number;
  settleFrames: number;
  transitionFrames: number;
  endPadFrames: number;
}

/**
 * Build the ordered list of placed segments + the endPad boundary. Pure → shared
 * by the composition render body and plan-chunks. Frame totals use the SAME
 * rounding as `getBookDurationInFrames` (ceil anim, round settle/transition/pad).
 */
export function buildBookSegmentLayout(
  sequence: BookLayoutSequence,
  fps = VIDEO_FPS,
  edition: PlayEdition = "interactive"
): BookSegmentLayout {
  const settleFrames = Math.round(AUTO_SPREAD_SETTLE_SEC * fps);
  const transitionFrames = Math.round(TRANSITION_SEC * fps);
  const endPadFrames = Math.round(END_PAD_SEC * fps);

  const segments: SegmentPlacement[] = [];
  let cursor = 0;

  sequence.ordered.forEach((item, i) => {
    const totalSec = getSpreadTotalSec(item.spread, edition);
    const animFrames = Math.ceil(totalSec * fps);
    const spreadDuration = animFrames + settleFrames;

    segments.push({
      kind: "spread",
      spread: item.spread,
      orderIndex: i,
      startFrame: cursor,
      durationFrames: spreadDuration,
      animFrames,
      totalSec,
    });
    cursor += spreadDuration;

    if (item.turnToNext === "next") {
      const next = sequence.ordered[i + 1];
      // Defensive: a 'next' flag with no following spread can't flip — skip.
      if (next) {
        segments.push({
          kind: "turn",
          fromSpread: item.spread,
          toSpread: next.spread,
          fromOrderIndex: i,
          startFrame: cursor,
          durationFrames: transitionFrames,
          fromTotalSec: totalSec,
        });
        cursor += transitionFrames;
      }
    }
  });

  const endPadStartFrame = cursor;
  const totalFrames = Math.max(1, cursor + endPadFrames);

  return {
    segments,
    endPadStartFrame,
    totalFrames,
    settleFrames,
    transitionFrames,
    endPadFrames,
  };
}
