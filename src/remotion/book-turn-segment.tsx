// remotion/book-turn-segment.tsx — one page-turn segment of the full-book mega
// composition. Rendered INSIDE a <Sequence from> so `useCurrentFrame()` returns the
// LOCAL flip frame (0 .. transitionFrames).
//
// This is a TRUE page-turn (a single leaf folding over the spine), reconstructing the
// live player's overlay structure (spread-turn-overlay.tsx §3.5) in Remotion's
// frame-driven idiom — NOT a whole-card flip. Two stacking contexts:
//
//   UNDER-LAYER (flat, zIndex 0) — the spread(s) beneath the leaf. NOT a 3D context,
//   so its items (videos included — each gets its own compositor layer) cannot win the
//   paint order against the leaf above:
//     • Base   — toSpread @ 0. Its RIGHT half is revealed as the leaf lifts; its LEFT
//                half stays covered by Static (then by the leaf's back face).
//     • Static — fromSpread @ settle, clipped to the NON-flipping (left, for `next`)
//                half, painted above Base. Pinned the whole turn.
//
//   LEAF (3D, zIndex 1) — the turning page in its OWN context ABOVE the under-layer
//   (mirrors the live overlay's portal-on-top z-index). Perspective on the wrapper;
//   only the leaf rotates inside it (no base video to fight). preserve-3d card pivots
//   at the spine (transformOrigin 50% 50%), rotateY from the shared computeFlipTransform:
//     • FRONT — fromSpread @ settle, clipped to the flipping (right) half. Backface
//               hidden → visible 0°→90°, opacity drops to 0 at the swap midpoint.
//     • BACK  — toSpread @ 0, clipped to the INVERSE (left) half, self-rotateY(180),
//               backface hidden → visible 90°→180°, lands on the incoming half (the
//               left side of the spread beneath).
//
// Why the split: with base+static+leaf as siblings under ONE perspective, a base video
// (separate compositor layer) painted OVER the rotating leaf — the turning page got
// covered by the spread below. Isolating the leaf in a higher-z stacking context fixes
// both the lift (front above base) and the 90°→180° reveal (back above base).
//
// Seam invariants (verified): progress=0 → viewport = full fromSpread @ settle
// (matches preceding segment's last held frame); progress=1 → viewport = full toSpread
// @ 0 (matches next segment's frame 0). Both frozen faces are silent — the page-turn
// SFX is emitted by the book composition at the turn's start frame (design 06 §6).
//
// Flip math + clip geometry come from the SHARED spread-flip-transform (same easing,
// pivot, opacity-swap, and half-page clips the live player uses) — render === live.

import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlayableSpread } from "@/types/playable-types";
import type { RemixLanguageCode } from "@/types/editor";
import { BookSpreadCore } from "./book-spread-core";
import {
  computeFlipTransform,
  resolveTurnClips,
} from "@/features/editor/components/playable-spread-view/spread-flip-transform";

export interface BookTurnSegmentProps {
  /** Outgoing spread (front face + static half) — frozen at its settle-hold frame. */
  fromSpread: PlayableSpread;
  /** Total animated seconds of the outgoing spread (front/static freeze seek time). */
  fromTotalSec: number;
  /** Incoming spread (base + back face) — frozen at initial state (t=0). */
  toSpread: PlayableSpread;
  language: RemixLanguageCode;
  canvasWidth?: number;
  /** Flip duration in frames = round(TRANSITION_SEC*fps). */
  transitionFrames: number;
}

/** One clipped flip face of the leaf. Fills the frame, clips to its half, hides its
 *  backface so the browser shows it only while it faces the viewer. */
function FlipFace({
  opacity,
  clipPath,
  back,
  children,
}: {
  opacity: number;
  clipPath: string;
  back?: boolean;
  children: React.ReactNode;
}) {
  return (
    <AbsoluteFill
      style={{
        opacity,
        clipPath,
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        overflow: "hidden",
        // Back face is pre-rotated 180° so it sits back-to-back with the front; once
        // the card passes edge-on (90°) the browser reveals it un-mirrored.
        transform: back ? "rotateY(180deg)" : undefined,
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
  // Front/static hold the outgoing spread's settle frame: read-along reference frame
  // === ceil(totalSec*fps), identical to the preceding spread-segment's clamped
  // wordFrame (seam parity).
  const frontWordFrame = Math.ceil(fromTotalSec * fps);

  const progress = interpolate(localFrame, [0, transitionFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  // Book turns are always forward ('next' — book-segment-layout only emits 'next').
  const t = computeFlipTransform(progress, "next", "spread");
  const { staticClip, frontClip, backClip } = resolveTurnClips("next");

  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff" }}>
      {/* UNDER-LAYER (flat, z0) — the spread(s) beneath the turning leaf. NOT a 3D
          context, so its items (incl. videos, which get their own compositor layer)
          stay strictly below the leaf above. */}
      <AbsoluteFill style={{ zIndex: 0 }}>
        {/* Base — incoming spread @ t=0. Right half revealed as the leaf lifts; left
            half stays covered by Static (and later the leaf's back face). */}
        <AbsoluteFill>
          <BookSpreadCore
            spread={toSpread}
            language={language}
            canvasWidth={canvasWidth}
            seekSec={0}
            wordFrame={0}
          />
        </AbsoluteFill>

        {/* Static — outgoing spread's non-flipping half, pinned above Base. */}
        <AbsoluteFill style={{ clipPath: staticClip, overflow: "hidden" }}>
          <BookSpreadCore
            spread={fromSpread}
            language={language}
            canvasWidth={canvasWidth}
            seekSec={fromTotalSec}
            wordFrame={frontWordFrame}
          />
        </AbsoluteFill>
      </AbsoluteFill>

      {/* LEAF (3D, z1) — the turning page in its OWN stacking context ABOVE the
          under-layer (mirrors the live overlay's portal-on-top). Perspective lives on
          this wrapper; only the leaf rotates inside it, so no base item — video or
          otherwise — can ever paint over the page mid-turn. Transparent outside the
          painted half, so the under-layer shows through where the leaf lifts. */}
      <AbsoluteFill style={{ zIndex: 1, perspective: `${t.perspective_px}px` }}>
        <AbsoluteFill
          style={{
            transformStyle: "preserve-3d",
            transformOrigin: t.transformOrigin,
            transform: `rotateY(${t.rotateY_deg}deg)`,
          }}
        >
          <FlipFace opacity={t.frontOpacity} clipPath={frontClip}>
            <BookSpreadCore
              spread={fromSpread}
              language={language}
              canvasWidth={canvasWidth}
              seekSec={fromTotalSec}
              wordFrame={frontWordFrame}
            />
          </FlipFace>

          <FlipFace opacity={t.backOpacity} clipPath={backClip} back>
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
    </AbsoluteFill>
  );
}
