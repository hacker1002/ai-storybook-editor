// remotion/book-turn-segment.tsx — one page-turn (flip) segment of the full-book
// mega composition. Rendered INSIDE a <Sequence from> so `useCurrentFrame()`
// returns the LOCAL flip frame (0 .. transitionFrames).
//
// Both faces are FROZEN spreads (no animation): the live player suspends autoplay
// of the incoming spread while flipping, so the render must too.
//   • FRONT = spread_i frozen at totalSec_i (its settle-hold frame — seam-matches
//     the preceding spread-segment's last held frame).
//   • BACK  = spread_{i+1} frozen at 0 (its initial state — seam-matches the next
//     spread-segment's t=0). Rotated 180° + backfaceVisibility hidden so it only
//     shows after the half-flip.
//
// Flip math is the SHARED computeFlipTransform (phase 01) — same easing/opacity
// swap the live player uses. NO @remotion/transitions (design 06 §6: Chrome flag
// + algorithm divergence). This segment emits NO <Audio> → the transition window
// is silent on the 0:a track (audio is per-spread-segment only).

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlayableSpread } from "@/types/playable-types";
import type { RemixLanguageCode } from "@/types/editor";
import { BookSpreadCore } from "./book-spread-core";
import {
  computeFlipTransform,
  PAPER_BG_COLOR,
  PAPER_INNER_SHADOW,
} from "@/features/editor/components/playable-spread-view/spread-flip-transform";

export interface BookTurnSegmentProps {
  /** Outgoing spread (front face) — frozen at its settle-hold frame. */
  fromSpread: PlayableSpread;
  /** Total animated seconds of the outgoing spread (front freeze seek time). */
  fromTotalSec: number;
  /** Incoming spread (back face) — frozen at initial state (t=0). */
  toSpread: PlayableSpread;
  language: RemixLanguageCode;
  canvasWidth?: number;
  /** Flip duration in frames = round(TRANSITION_SEC*fps). */
  transitionFrames: number;
}

/** A single flip face — fills the frame and clips overflow. */
function FlipFace({
  opacity,
  back,
  children,
}: {
  opacity: number;
  back?: boolean;
  children: React.ReactNode;
}) {
  return (
    <AbsoluteFill
      style={{
        opacity,
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        overflow: "hidden",
        // Back face is pre-rotated 180° so it reads correctly once the card passes
        // edge-on (90°). Paper styling emulates the page back (design 07 §2.2).
        transform: back ? "rotateY(180deg)" : undefined,
        backgroundColor: back ? PAPER_BG_COLOR : undefined,
        boxShadow: back ? PAPER_INNER_SHADOW : undefined,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

export function BookTurnSegment({
  fromSpread,
  fromTotalSec,
  toSpread,
  language,
  canvasWidth,
  transitionFrames,
}: BookTurnSegmentProps) {
  const localFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Front holds its settle frame: read-along reference frame === ceil(totalSec*fps),
  // identical to the preceding spread-segment's clamped wordFrame (seam parity).
  const frontWordFrame = Math.ceil(fromTotalSec * fps);

  const progress = interpolate(localFrame, [0, transitionFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const t = computeFlipTransform(progress, "next", "spread");

  return (
    <AbsoluteFill style={{ perspective: `${t.perspective_px}px` }}>
      <AbsoluteFill
        style={{
          transformStyle: "preserve-3d",
          transformOrigin: t.transformOrigin,
          transform: `rotateY(${t.rotateY_deg}deg)`,
        }}
      >
        <FlipFace opacity={t.frontOpacity}>
          {/* Front frozen at its settle-hold frame → seam-matches preceding segment. */}
          <BookSpreadCore
            spread={fromSpread}
            language={language}
            canvasWidth={canvasWidth}
            seekSec={fromTotalSec}
            wordFrame={frontWordFrame}
          />
        </FlipFace>

        <FlipFace opacity={t.backOpacity} back>
          {/* Back frozen at t=0 → seam-matches next spread-segment's initial frame. */}
          <BookSpreadCore
            spread={toSpread}
            language={language}
            canvasWidth={canvasWidth}
            seekSec={0}
            wordFrame={0}
          />
        </FlipFace>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
