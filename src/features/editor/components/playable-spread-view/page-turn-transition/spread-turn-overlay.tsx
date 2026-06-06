// spread-turn-overlay.tsx — Player-side ADAPTER for the page-turn transition.
//
// Thin wrapper around the shared `TurnLeafSkeleton` (presentational DOM + 3D
// invariants). This adapter owns ONLY the player-specific concerns:
//   • `createPortal(..., document.body)` — overlay lives outside the React tree
//     so it can position over PlayerCanvas without layout interference.
//   • `appendChild`-based clone mounting — the OLD spread snapshot is a real
//     detached DOM node (not React content); mounted via 2 `useEffect`s into
//     the front + static slots exposed by the skeleton, and the NEW spread
//     snapshot into the back face when `backNode` arrives (~400 ms after
//     startTurn — see `use-spread-turn-transition` for timing rationale).
//   • Fixed positioning via the live spread container's bounding rect.
//
// The hook (`use-spread-turn-transition`) drives transforms via GSAP imperative
// writes on the skeleton's `cardRef` / `frontRef` / `backRef`. The skeleton
// renders default values (rotateY=0, front=1, back=0) on mount; GSAP mutates
// `.style` per tick. Overlay does NOT re-render during the flip window (props
// are stable refs) so React never resets GSAP's writes.
"use client";

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createLogger } from '@/utils/logger';
import { TurnLeafSkeleton } from './spread-turn-leaf-skeleton';
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
  /** Detached clone of the NEW spread, captured ~400 ms after `onSwap`
   *  commits — mounted into the BackFace so the user sees NEW content rotate
   *  in past midpoint (true book metaphor). `null` while not yet ready;
   *  BackFace falls back to the cream paper bg in that brief window. */
  backNode: HTMLElement | null;
  /** Forwarded refs — provided by the hook (single owner). */
  refs: SpreadTurnOverlayRefs;
}

/** Player overlay: portals `TurnLeafSkeleton` into document.body and mounts the
 *  outgoing/incoming snapshot clones into the skeleton's slots via ref. */
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

    if (staticNode) {
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

  // Mount NEW snapshot into BackFace once the hook hands it over (~400 ms
  // post-onSwap — see hook for timing rationale). Cleanup removes the captured
  // instance so swapping the prop mid-flight cannot leak nodes.
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

  return createPortal(
    <TurnLeafSkeleton
      direction={direction}
      positioner={containerRect}
      cardRef={flippingCardRef}
      frontRef={frontFaceRef}
      backRef={backFaceRef}
      staticRef={staticLayerRef}
      // Slots intentionally null — snapshot DOM clones are appendChild-d by the
      // useEffects above (not React children). Skeleton renders empty <div ref>
      // shells; GSAP drives transforms via the refs.
      staticSlot={null}
      frontSlot={null}
      backSlot={null}
    />,
    document.body,
  );
}
