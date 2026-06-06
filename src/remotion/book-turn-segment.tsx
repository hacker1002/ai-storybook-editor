// remotion/book-turn-segment.tsx — Render-side ADAPTER for one page-turn
// segment of the full-book mega composition. Rendered inside a <Sequence from>
// so `useCurrentFrame()` returns the LOCAL flip frame (0 .. transitionFrames).
//
// Thin wrapper around the shared `TurnLeafSkeleton` (presentational DOM + 3D
// invariants). This adapter owns ONLY the render-specific concerns:
//   • Frame-clock driver — `interpolate` → `computeFlipTransform(progress)` →
//     declarative `cardTransform` + `faceOpacity` props every frame.
//   • `<Freeze frame>` wrap on each `BookSpreadCore` — without this, Remotion's
//     OffthreadVideo / ThorVG lottie read the global frame clock and auto-play
//     across the turn (the turn is a still snapshot, not playback). Outgoing
//     freezes at settle frame, incoming at 0 (still / blank).
//   • Slot mapping:
//       baseSlot   = toSpread @ 0          (incoming under-layer)
//       staticSlot = fromSpread @ settle   (outgoing non-flipping half)
//       frontSlot  = fromSpread @ settle   (flipping front face)
//       backSlot   = toSpread @ 0          (flipping back face)
//
// Skeleton owns:  perspective on positioner, preserve-3d card, transformOrigin
// at gutter, INVERSE-clip back face, rotateY(180) back self-rotation, paper bg,
// zIndex isolation (base z0-trap / static z1 / leaf-card z1). Any structural
// drift between player and render lives in the skeleton — fix once.
//
// Seam invariants (verified): progress=0 → viewport = full fromSpread @ settle
// (matches preceding segment's last held frame); progress=1 → viewport = full
// toSpread @ 0 (matches next segment's frame 0). Both frozen faces are silent
// — the page-turn SFX is emitted by the book composition at the turn's start
// frame (design 06 §6).

import { AbsoluteFill, Freeze, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlayableSpread, PlayEdition } from "@/types/playable-types";
import type { RemixLanguageCode } from "@/types/editor";
import { BookSpreadCore } from "./book-spread-core";
import { computeFlipTransform } from "@/features/editor/components/playable-spread-view/page-turn-transition/spread-flip-transform";
import { TurnLeafSkeleton } from "@/features/editor/components/playable-spread-view/page-turn-transition/spread-turn-leaf-skeleton";

export interface BookTurnSegmentProps {
  /** Outgoing spread (front face + static half) — frozen at its settle-hold frame. */
  fromSpread: PlayableSpread;
  /** Total animated seconds of the outgoing spread (front/static freeze seek time). */
  fromTotalSec: number;
  /** Incoming spread (base + back face) — frozen at initial state (t=0). */
  toSpread: PlayableSpread;
  language: RemixLanguageCode;
  /** Play edition — forwarded to both frozen faces so a classic turn freezes the
   *  static (read-along-only) render of each spread, matching its spread-segment. */
  edition?: PlayEdition;
  canvasWidth?: number;
  /** Flip duration in frames = round(TRANSITION_SEC*fps). */
  transitionFrames: number;
}

export function BookTurnSegment({
  fromSpread,
  fromTotalSec,
  toSpread,
  language,
  edition,
  canvasWidth,
  transitionFrames,
}: BookTurnSegmentProps) {
  const localFrame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Front/static hold the outgoing spread's settle frame: read-along reference frame
  // === ceil(totalSec*fps), identical to the preceding spread-segment's clamped
  // wordFrame (seam parity).
  const frontWordFrame = Math.ceil(fromTotalSec * fps);

  // Media freeze frames. The turn is a FROZEN snapshot, but OffthreadVideo / ThorVG
  // lottie read Remotion's frame clock (not the GSAP seekSec prop), so without an
  // explicit <Freeze> they keep playing across the turn's own <Sequence>. Pin each
  // face's media to the frame matching its frozen seek time: outgoing → settle frame,
  // incoming → 0 (its videos haven't started → still/blank, seam-matches next segment).
  const fromFreezeFrame = frontWordFrame;
  const toFreezeFrame = 0;

  const progress = interpolate(localFrame, [0, transitionFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Book turns are always forward ('next' — book-segment-layout only emits 'next').
  const t = computeFlipTransform(progress, "next", "spread");

  const fromFace = (
    <Freeze frame={fromFreezeFrame}>
      <BookSpreadCore
        spread={fromSpread}
        language={language}
        edition={edition}
        canvasWidth={canvasWidth}
        seekSec={fromTotalSec}
        wordFrame={frontWordFrame}
      />
    </Freeze>
  );
  const toFace = (
    <Freeze frame={toFreezeFrame}>
      <BookSpreadCore
        spread={toSpread}
        language={language}
        edition={edition}
        canvasWidth={canvasWidth}
        seekSec={0}
        wordFrame={0}
      />
    </Freeze>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff" }}>
      <TurnLeafSkeleton
        direction="next"
        positioner="fill"
        cardTransform={`rotateY(${t.rotateY_deg}deg)`}
        faceOpacity={{ front: t.frontOpacity, back: t.backOpacity }}
        baseSlot={toFace}
        staticSlot={fromFace}
        frontSlot={fromFace}
        backSlot={toFace}
      />
    </AbsoluteFill>
  );
}
