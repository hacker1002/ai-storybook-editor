// remotion/book-spread-segment.tsx — one spread-segment of the full-book mega
// composition. Rendered INSIDE a <Sequence from={segmentStartFrame}>, so
// `useCurrentFrame()` here returns the LOCAL frame (0 .. animFrames+settleFrames).
//
// Frame→tlTime mapping (design 06 §4.1 — settle hold):
//   localFrame f < animFrames → tlTime = f/fps      (animation plays)
//   localFrame f ≥ animFrames → tlTime = totalSec   (clamp: hold last frame)
//
// The segment renders ONLY the visual stage (BookSpreadCore). Per-spread audio is
// emitted by the parent book composition at book-level frame offsets, NOT here —
// so a spread reused inside a flip face stays silent and audio offsets compose by
// one addition at the composition level (no double counting).

import { useCurrentFrame, useVideoConfig } from "remotion";
import type { PlayableSpread, PlayEdition } from "@/types/playable-types";
import type { RemixLanguageCode } from "@/types/editor";
import { BookSpreadCore } from "./book-spread-core";

export interface BookSpreadSegmentProps {
  spread: PlayableSpread;
  language: RemixLanguageCode;
  /** Play edition — forwarded to the render core so classic plays read-along only. */
  edition?: PlayEdition;
  canvasWidth?: number;
  /** Total animated seconds (from linearizeSpreadTimeline) — clamp ceiling. */
  totalSec: number;
  /** Frames the animation occupies = ceil(totalSec*fps). Beyond this → settle hold. */
  animFrames: number;
}

/**
 * Spread-segment: plays the spread's animation then holds the last frame for the
 * settle window. Read-along highlight uses the same clamped local frame so the
 * held frame shows the final highlighted word (not a mid-animation word).
 */
export function BookSpreadSegment({
  spread,
  language,
  edition,
  canvasWidth,
  totalSec,
  animFrames,
}: BookSpreadSegmentProps) {
  const localFrame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Clamp to the settle hold: once the animation has played out, freeze at totalSec.
  const seekSec = localFrame < animFrames ? localFrame / fps : totalSec;
  // Word highlight reference frame clamps too (so settle shows the last word).
  const wordFrame = localFrame < animFrames ? localFrame : animFrames;

  return (
    <BookSpreadCore
      spread={spread}
      language={language}
      edition={edition}
      canvasWidth={canvasWidth}
      seekSec={seekSec}
      wordFrame={wordFrame}
    />
  );
}
