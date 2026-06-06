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
// Media freeze: GSAP + read-along are frozen via explicit seekSec/wordFrame props, but
// OffthreadVideo / ThorVG lottie read Remotion's frame clock — so each BookSpreadCore is
// wrapped in <Freeze frame> (outgoing → settle frame, incoming → 0) to stop video/lottie
// from auto-playing across the turn (the turn is a still snapshot, not playback).
//
// Seam invariants (verified): progress=0 → viewport = full fromSpread @ settle
// (matches preceding segment's last held frame); progress=1 → viewport = full toSpread
// @ 0 (matches next segment's frame 0). Both frozen faces are silent — the page-turn
// SFX is emitted by the book composition at the turn's start frame (design 06 §6).
//
// Flip math + clip geometry come from the SHARED spread-flip-transform (same easing,
// pivot, opacity-swap, and half-page clips the live player uses) — render === live.

import { AbsoluteFill, Freeze, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlayableSpread, PlayEdition } from "@/types/playable-types";
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
  /** Play edition — forwarded to both frozen faces so a classic turn freezes the
   *  static (read-along-only) render of each spread, matching its spread-segment. */
  edition?: PlayEdition;
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
  const { staticClip, frontClip, backClip } = resolveTurnClips("next");

  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff" }}>
      {/* UNDER-LAYER (flat, z0) — the spread(s) beneath the turning leaf. NOT a 3D
          context, so its items (incl. videos, which get their own compositor layer)
          stay strictly below the leaf above. */}
      <AbsoluteFill style={{ zIndex: 0 }}>
        {/* Base — incoming spread @ t=0. Right half revealed as the leaf lifts; left
            half stays covered by Static (and later the leaf's back face). zIndex:0
            makes this AbsoluteFill its OWN stacking context so the incoming spread's
            item z-indexes (a NEW video/shape on the left half) stay TRAPPED inside
            Base. With z-index:auto here those positioned items escape into the
            under-layer's context and paint OVER the Static OLD-left below — leaking
            new content during the turn (the video+shape bleed seen on the left). */}
        <AbsoluteFill style={{ zIndex: 0 }}>
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
        </AbsoluteFill>

        {/* Static — outgoing spread's non-flipping half, pinned above Base. zIndex:1
            lifts the WHOLE old-left layer above Base's now-contained stacking context
            (parity with the live player, where StaticLayer lives in a portal above
            PlayerCanvas → always wins the left half regardless of item z-index). */}
        <AbsoluteFill style={{ clipPath: staticClip, overflow: "hidden", zIndex: 1 }}>
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
          </FlipFace>

          <FlipFace opacity={t.backOpacity} clipPath={backClip} back>
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
          </FlipFace>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
