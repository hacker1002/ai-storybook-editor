// spread-turn-leaf-skeleton.tsx — Presentational DOM skeleton + invariant 3D
// styling for the page-turn transition. Single source of truth shared between
// the LIVE player overlay (GSAP imperative drive, refs) and the Remotion render
// segment (declarative per-frame drive, props). Owns NO state, NO clock, NO
// content production — caller plugs in via slots / refs / style overrides.
//
// Invariants owned here (drift-prone — bug magnets if duplicated):
//   • perspective lives on the POSITIONER (parent of the rotating element) —
//     regression 2026-05-07 if put inside the rotating transform.
//   • preserve-3d on the card; transformOrigin = gutter (LAYOUT_PIVOT_MAP.spread).
//   • back face = self-rotateY(180deg) + backface-visibility:hidden, INVERSE
//     clip vs front (resolveTurnClips()).
//   • zIndex isolation: base (z0-trap) / static (z1) / leaf-card (z1) so a base
//     spread's positioned items (videos on their own compositor layer) cannot
//     leak above the static OLD-half or the rotating leaf.
//   • cream paper bg + inset shadow on back face (page-thickness illusion).
//
// Drive contract — TWO modes, ONE skeleton:
//   • Imperative (player/GSAP) — caller passes `cardRef`/`frontRef`/`backRef`
//     and OMITS `cardTransform`/`faceOpacity`. Skeleton renders defaults
//     (rotateY=0, front=1, back=0); GSAP mutates `.style` on the refs each
//     tick. Overlay does NOT re-render in the flip window → React never resets
//     GSAP's writes.
//   • Declarative (render/Remotion) — caller passes `cardTransform` +
//     `faceOpacity` recomputed each frame; refs unused.
//
// Spec (design): playable-spread-view/03-13-spread-turn-leaf-skeleton.md (phase 06).

import type { CSSProperties, ReactNode, Ref } from 'react';
import { createLogger } from '@/utils/logger';
import {
  LAYOUT_PIVOT_MAP,
  PAPER_BG_COLOR,
  PAPER_INNER_SHADOW,
  PERSPECTIVE_PX,
  resolveTurnClips,
  type TurnDirection,
} from './spread-flip-transform';
import { OVERLAY_Z_INDEX } from './spread-turn-constants';

const log = createLogger('Editor', 'TurnLeafSkeleton');

export interface TurnLeafSkeletonProps {
  /** Turn direction — picks the clip set (`resolveTurnClips`). */
  direction: TurnDirection;

  /** `'fill'` → render mode (`position:absolute; inset:0`), used inside an
   *  AbsoluteFill (Remotion). `DOMRect` → player overlay mode (`position:fixed`
   *  + rect coords) pinned to the live PlayerCanvas spread container. */
  positioner: 'fill' | DOMRect;

  /** Declarative drive (render): full `transform` string applied to the card,
   *  e.g. `'rotateY(-45deg)'`. Player omits — GSAP writes `.style.transform`. */
  cardTransform?: string;

  /** Declarative drive (render): per-frame opacity for both faces. Player
   *  omits — front defaults to 1, back to 0; GSAP swaps at midpoint via refs. */
  faceOpacity?: { front: number; back: number };

  /** Imperative drive (player): forwarded so the hook's GSAP timeline can
   *  `gsap.set(ref.current, …)` each tick without re-rendering React. */
  cardRef?: Ref<HTMLDivElement>;
  frontRef?: Ref<HTMLDivElement>;
  backRef?: Ref<HTMLDivElement>;
  /** Player exposes to host so `appendChild`-d snapshot lives in the
   *  same stacking context the skeleton declares (no z-index drift). */
  staticRef?: Ref<HTMLDivElement>;

  /** Optional content slots:
   *   - `baseSlot`     render-only (under-layer; incoming spread @ t=0).
   *   - `staticSlot`   non-flipping half (player: null, content appended via ref).
   *   - `frontSlot`    flipping front face (player: null, ref appends).
   *   - `backSlot`     flipping back face (player: null, ref appends). */
  baseSlot?: ReactNode;
  staticSlot?: ReactNode;
  frontSlot?: ReactNode;
  backSlot?: ReactNode;
}

function buildPositionerStyle(positioner: 'fill' | DOMRect): CSSProperties {
  // perspective is the most critical invariant — bug 2026-05-07 if it lives
  // inside the rotating element instead of on its parent.
  const base: CSSProperties = { perspective: `${PERSPECTIVE_PX}px` };
  if (positioner === 'fill') {
    // Remotion path: caller wraps us in <AbsoluteFill>. We just need
    // inset:0 so the inner card fills the parent box. Skip fixed/zIndex
    // (Remotion sequence already owns positioning).
    return { ...base, position: 'absolute', inset: 0 };
  }
  return {
    ...base,
    position: 'fixed',
    top: positioner.top,
    left: positioner.left,
    width: positioner.width,
    height: positioner.height,
    zIndex: OVERLAY_Z_INDEX,
    pointerEvents: 'none',
  };
}

/**
 * Render the shared skeleton:
 *   <positioner perspective>
 *     [baseSlot? wrapped in z0-trap stacking context]
 *     <staticRef static-clip z1>{staticSlot}</static>
 *     <cardRef preserve-3d, rotate, z1>
 *       <frontRef front-clip, backface:hidden>{frontSlot}</front>
 *       <backRef  back-clip, backface:hidden, rotateY(180), paper-bg>{backSlot}</back>
 *     </card>
 *   </positioner>
 */
export function TurnLeafSkeleton({
  direction,
  positioner,
  cardTransform,
  faceOpacity,
  cardRef,
  frontRef,
  backRef,
  staticRef,
  baseSlot,
  staticSlot,
  frontSlot,
  backSlot,
}: TurnLeafSkeletonProps) {
  const { frontClip, backClip, staticClip } = resolveTurnClips(direction);
  // Spread layout — book always flips on the spread pivot (single-* not used by
  // the render side and the player forces 'spread' in startTurn).
  const pivotOrigin = LAYOUT_PIVOT_MAP.spread;
  const positionerStyle = buildPositionerStyle(positioner);

  // zIndex isolation is REQUIRED for the render side (baseSlot present): the
  // incoming under-layer's positioned items would otherwise paint over Static
  // and the rotating leaf (bug fixed 2026-06). It is NOT safe to add when no
  // baseSlot is present (player overlay path): adding explicit zIndex to the
  // static layer and/or `overflow:hidden` to the front/back faces interacts
  // with `preserve-3d` + `clip-path` and visibly flattens the leaf below
  // the spreadContainer underneath. Drive the gating off `baseSlot`.
  const hasBase = baseSlot !== undefined && baseSlot !== null;

  log.debug('render', 'rendering skeleton', {
    direction,
    positionerMode: positioner === 'fill' ? 'fill' : 'rect',
    hasBaseSlot: hasBase,
    declarativeDrive: cardTransform !== undefined,
  });

  return (
    <div data-testid="spread-turn-skeleton" style={positionerStyle}>
      {hasBase ? (
        // z0-trap: forces an explicit stacking context so positioned items
        // INSIDE the base (e.g. an incoming video w/ its own compositor layer)
        // cannot escape into the parent and paint over Static / leaf. Without
        // this trap, a single new-spread video on the left half leaks above
        // OLD-left during the turn (render bug observed 2026-05).
        <div
          data-testid="spread-turn-base"
          style={{ position: 'absolute', inset: 0, zIndex: 0 }}
        >
          {baseSlot}
        </div>
      ) : null}

      <div
        ref={staticRef}
        data-testid="spread-turn-static-layer"
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: staticClip,
          ...(hasBase && { overflow: 'hidden', zIndex: 1 }),
        }}
      >
        {staticSlot}
      </div>

      <div
        ref={cardRef}
        data-testid="spread-turn-flipping-card"
        style={{
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transformOrigin: pivotOrigin,
          // Only declare `transform` when the caller drives it declaratively
          // (render path). Player path drives via GSAP on the ref — must NOT
          // emit a React-controlled `transform` (even undefined) since some
          // reconciliation paths can null-out an inline transform that GSAP
          // wrote after mount.
          ...(cardTransform !== undefined && { transform: cardTransform }),
          ...(hasBase && { zIndex: 1 }),
          willChange: 'transform',
        }}
      >
        {/* Front face — outgoing spread's flipping half. Backface-hidden so the
         *  browser auto-hides it past 90°. Opacity default 1 (player) / driven
         *  per-frame (render). */}
        <div
          ref={frontRef}
          data-testid="spread-turn-front-face"
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: frontClip,
            opacity: faceOpacity?.front ?? 1,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            // overflow:hidden flattens the 3D-context child against preserve-3d
            // when combined with clip-path on a backface-hidden element — the
            // browser pre-rasterizes the face into a 2D bitmap before the card's
            // perspective composes it. Render needs it (parity with §4 isolation);
            // player breaks visibly without it disabled (leaf paints below the
            // live spreadContainer underneath).
            ...(hasBase && { overflow: 'hidden' }),
          }}
        >
          {frontSlot}
        </div>

        {/* Back face — pre-rotated 180° so it sits back-to-back with the front.
         *  INVERSE clip vs front so the back content lands on the INCOMING half
         *  rather than snapping back to the outgoing half (see
         *  spread-flip-transform.ts → resolveTurnClips for the geometry note).
         *  Paper bg + inset shadow paint a page-thickness illusion behind the
         *  incoming content while the back face faces the viewer (90°→180°). */}
        <div
          ref={backRef}
          data-testid="spread-turn-back-face"
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: backClip,
            opacity: faceOpacity?.back ?? 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            ...(hasBase && { overflow: 'hidden' }),
            background: PAPER_BG_COLOR,
            boxShadow: PAPER_INNER_SHADOW,
            transform: 'rotateY(180deg)',
          }}
        >
          {backSlot}
        </div>
      </div>
    </div>
  );
}
