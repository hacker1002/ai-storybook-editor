// spread-turn-overlay.tsx - Dumb portal overlay for the spread-turn transition.
// Renders the layered DOM and mounts the snapshot clones. Owns NO state and NO
// GSAP timeline — the `useSpreadTurnTransition` hook drives transforms via
// the exposed refs.
//
// Layout strategy (spec §3.5 / §3.6):
//   - `spread` layout      → StaticLayer (non-flipping half pinned) + FlippingCard.
//   - `single-left/right`  → FlippingCard only (whole page flips, no static layer).
//
// Card-flip pattern: BackFace has `transform: rotateY(180deg)` so it sits
// back-to-back with FrontFace. backfaceVisibility:hidden on both — the browser
// auto-hides whichever face has its back to the viewer. The hook's opacity flip
// at midpoint is a redundant but harmless belt-and-braces.
"use client";

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createLogger } from '@/utils/logger';
import {
  LAYOUT_PIVOT_MAP,
  OVERLAY_Z_INDEX,
  PAPER_BG_COLOR,
  PAPER_INNER_SHADOW,
} from './spread-turn-constants';
import type { TurnSnapshot } from './spread-turn-types';

const log = createLogger('Editor', 'SpreadTurnOverlay');

/** Refs forwarded out of the overlay so the hook can attach a GSAP timeline to
 *  each flipping layer. The hook calls `.current` directly on these refs.
 *  StaticLayer is intentionally NOT exposed — it never animates. */
export interface SpreadTurnOverlayRefs {
  flippingCardRef: React.RefObject<HTMLDivElement | null>;
  frontFaceRef: React.RefObject<HTMLDivElement | null>;
  backFaceRef: React.RefObject<HTMLDivElement | null>;
}

export interface SpreadTurnOverlayProps {
  /** Snapshot of the outgoing spread — clones are appended into the appropriate
   *  layers on mount. */
  snapshot: TurnSnapshot;
  /** Bounding rect of the live PlayerCanvas spread container (viewport coords).
   *  Captured by the hook at startTurn time so the overlay aligns pixel-perfectly. */
  containerRect: DOMRect | null;
  /** Detached clone of the NEW spread, captured one paint frame after `onSwap`
   *  commits — mounted into the BackFace so the user sees NEW content rotate
   *  in past midpoint (true book metaphor). `null` while not yet ready;
   *  BackFace falls back to the cream paper bg in that brief window. */
  backNode: HTMLElement | null;
  /** Forwarded refs — provided by the hook (single owner). */
  refs: SpreadTurnOverlayRefs;
}

/**
 * Render the layered overlay structure into `document.body` via portal.
 * Spread DOM tree:
 *   1. fixed positioner (overlay container, pointer-events: none, z=50)
 *   2. StaticLayer (only when layout === 'spread') — clipped to the non-flipping half
 *   3. FlippingCard (3D context — preserve-3d, perspective, transform-origin)
 *      3a. FrontFace (OLD snapshot, half-page clip for spread / no clip for single)
 *      3b. BackFace  (rotateY(180) → NEW snapshot once available, paper fallback)
 */
export function SpreadTurnOverlay({
  snapshot,
  containerRect,
  backNode,
  refs,
}: SpreadTurnOverlayProps) {
  const { flippingCardRef, frontFaceRef, backFaceRef } = refs;
  // Local ref for the static layer wrapper — internal only (no animation).
  const staticLayerRef = useRef<HTMLDivElement | null>(null);
  // Track which exact nodes were appended so cleanup removes the correct instance —
  // avoids accidentally orphaning siblings if the snapshot prop changes mid-flight.
  const flippingMountedRef = useRef<HTMLElement | null>(null);
  const staticMountedRef = useRef<HTMLElement | null>(null);
  const backMountedRef = useRef<HTMLElement | null>(null);

  const { direction, layout, staticNode, flippingNode } = snapshot;

  // Mount OLD snapshot clones (front + static) on mount; remove on unmount.
  useEffect(() => {
    const frontEl = frontFaceRef.current;
    const staticEl = staticLayerRef.current;

    if (!frontEl) {
      log.warn('mountSnapshot', 'front face ref not ready — cannot append flippingNode');
    } else {
      log.debug('mountSnapshot', 'appending flippingNode into front face', {
        direction,
        layout,
        hasStatic: staticNode !== null,
      });
      frontEl.appendChild(flippingNode);
      flippingMountedRef.current = flippingNode;
    }

    if (layout === 'spread' && staticNode) {
      if (!staticEl) {
        log.warn('mountSnapshot', 'static layer ref not ready — cannot append staticNode');
      } else {
        staticEl.appendChild(staticNode);
        staticMountedRef.current = staticNode;
      }
    }

    return () => {
      const flipping = flippingMountedRef.current;
      if (flipping && flipping.parentNode) {
        flipping.parentNode.removeChild(flipping);
      }
      flippingMountedRef.current = null;
      const stat = staticMountedRef.current;
      if (stat && stat.parentNode) {
        stat.parentNode.removeChild(stat);
      }
      staticMountedRef.current = null;
    };
  }, [direction, layout, staticNode, flippingNode, frontFaceRef]);

  // Mount NEW snapshot into BackFace once the hook hands it over (it arrives
  // 2 rAFs after startTurn — see hook for timing rationale). Cleanup removes
  // the captured instance so swapping the prop mid-flight cannot leak nodes.
  useEffect(() => {
    if (!backNode) return;
    const backEl = backFaceRef.current;
    if (!backEl) {
      log.warn('mountBackNode', 'back face ref not ready — cannot append backNode');
      return;
    }
    log.debug('mountBackNode', 'appending NEW snapshot into back face', {
      direction,
      layout,
    });
    backEl.appendChild(backNode);
    backMountedRef.current = backNode;
    return () => {
      const node = backMountedRef.current;
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
      backMountedRef.current = null;
    };
  }, [backNode, backFaceRef, direction, layout]);

  if (!containerRect) {
    log.debug('render', 'no containerRect — overlay not rendered');
    return null;
  }

  // Pivot origin from shared map (single source of truth — see Phase 1 constant).
  const pivotOrigin = LAYOUT_PIVOT_MAP[layout];

  // Clip-path matrix (spec §3.5):
  //   spread + next : front = right half, back = LEFT half (inverse), static = left half
  //   spread + prev : front = left half,  back = RIGHT half (inverse), static = right half
  //   single-*      : no clip (whole page flips), no static layer
  //
  // Why the back face uses the INVERSE clip of the front: BackFace has a static
  // `rotateY(180deg)` self-transform (back-to-back with FrontFace). With pivots
  // coinciding (parent + self both at 50% 50% of full container), the composed
  // rotation at parent rotateY(±180) is identity — so painted pixels land at
  // world x equal to their local x in the back face's box. Using the same clip
  // as the front would put the back face content back on the OUTGOING half at
  // the end of the flip, making the page appear to snap back instead of swinging
  // through to the opposite side. Inverting the clip places the back content on
  // the INCOMING half (where a real page-flip puts the back of the turned page),
  // matching the new spread underneath when the overlay unmounts.
  const isSpread = layout === 'spread';
  const flippingClip = !isSpread
    ? 'none'
    : direction === 'next'
      ? 'inset(0 0 0 50%)'
      : 'inset(0 50% 0 0)';
  const backFlippingClip = !isSpread
    ? 'none'
    : direction === 'next'
      ? 'inset(0 50% 0 0)'
      : 'inset(0 0 0 50%)';
  const staticClip = !isSpread
    ? 'none'
    : direction === 'next'
      ? 'inset(0 50% 0 0)'
      : 'inset(0 0 0 50%)';

  return createPortal(
    <div
      data-testid="spread-turn-overlay"
      style={{
        position: 'fixed',
        top: containerRect.top,
        left: containerRect.left,
        width: containerRect.width,
        height: containerRect.height,
        zIndex: OVERLAY_Z_INDEX,
        pointerEvents: 'none',
        // Establish a proper 3D viewing context for the FlippingCard's children
        // (FrontFace + BackFace). With perspective on the parent (instead of in
        // the rotating element's own `transform: perspective(...)`), the browser
        // evaluates `backface-visibility` against the composed orientation of
        // each child correctly — fixes the "back face never appears past 90°"
        // bug seen in screen recording 2026-05-07.
        perspective: '1200px',
      }}
    >
      {isSpread && (
        <div
          ref={staticLayerRef}
          data-testid="spread-turn-static-layer"
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: staticClip,
          }}
        />
      )}
      <div
        ref={flippingCardRef}
        data-testid="spread-turn-flipping-card"
        style={{
          width: '100%',
          height: '100%',
          transformStyle: 'preserve-3d',
          transformOrigin: pivotOrigin,
          // No `perspective(...)` on this element — the parent positioner owns
          // the 3D context. Hook's gsap.set drives only `rotationY` here.
          willChange: 'transform',
        }}
      >
        {/* Front face — OLD snapshot of the flipping half. */}
        <div
          ref={frontFaceRef}
          data-testid="spread-turn-front-face"
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: flippingClip,
            opacity: 1, // hook flips opacity to 0 at the swap midpoint
            backfaceVisibility: 'hidden',
          }}
        />
        {/* Back face — pre-rotated 180° so it sits back-to-back with the front.
         *  Once the hook supplies `backNode`, the NEW spread snapshot covers
         *  the paper fallback and renders un-mirrored when the parent rotation
         *  brings it into view past midpoint. */}
        <div
          ref={backFaceRef}
          data-testid="spread-turn-back-face"
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: backFlippingClip,
            background: PAPER_BG_COLOR,
            boxShadow: PAPER_INNER_SHADOW,
            opacity: 0, // hook flips opacity to 1 at the swap midpoint
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
