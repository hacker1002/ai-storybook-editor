// use-toolbar-position.ts - Shared hook for positioning toolbars relative to selected elements

import { useState, useLayoutEffect, useEffect, useRef, type RefObject } from "react";
import type { Geometry } from "@/types/spread-types";
import { geometryToScreenRect } from "../utils/coordinate-utils";
import { useSelectionToolbarPlacementStore } from "@/stores/selection-toolbar-placement-store";
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useToolbarPosition');

interface UseToolbarPositionOptions {
  geometry: Geometry | null;
  canvasRef: RefObject<HTMLElement | null>;
  toolbarRef: RefObject<HTMLDivElement | null>;
  gap?: number;
}

export interface ToolbarPosition {
  top: number;
  left: number;
  placement: 'above' | 'below' | 'left' | 'right';
}

export function useToolbarPosition({
  geometry,
  canvasRef,
  toolbarRef,
  gap = 8,
}: UseToolbarPositionOptions): ToolbarPosition | null {
  log.info('useToolbarPosition', 'init', { hasGeometry: !!geometry });
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateCanvasRect = () => {
      setCanvasRect(canvas.getBoundingClientRect());
    };

    updateCanvasRect();

    resizeObserverRef.current = new ResizeObserver(updateCanvasRect);
    resizeObserverRef.current.observe(canvas);

    const scrollHandler = () => updateCanvasRect();
    window.addEventListener('scroll', scrollHandler, { passive: true });

    return () => {
      resizeObserverRef.current?.disconnect();
      window.removeEventListener('scroll', scrollHandler);
    };
  }, [canvasRef]);

  useLayoutEffect(() => {
    if (!geometry || !canvasRect || !toolbarRef.current) {
      setPosition(null);
      return;
    }

    const itemRect = geometryToScreenRect(geometry, canvasRect);
    const toolbar = toolbarRef.current;
    const toolbarRect = toolbar.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;
    let placement: 'above' | 'below' | 'left' | 'right' = 'above';

    // Priority: above > left > right > below
    const topAbove = itemRect.top - toolbarRect.height - gap;
    if (topAbove >= gap) {
      top = topAbove;
      left = itemRect.left + (itemRect.width / 2) - (toolbarRect.width / 2);
      placement = 'above';
    } else {
      const leftPosition = itemRect.left - toolbarRect.width - gap;
      if (leftPosition >= gap) {
        left = leftPosition;
        top = itemRect.top + (itemRect.height / 2) - (toolbarRect.height / 2);
        placement = 'left';
      } else {
        const rightPosition = itemRect.right + gap;
        if (rightPosition + toolbarRect.width <= viewportWidth - gap) {
          left = rightPosition;
          top = itemRect.top + (itemRect.height / 2) - (toolbarRect.height / 2);
          placement = 'right';
        } else {
          top = itemRect.bottom + gap;
          left = itemRect.left + (itemRect.width / 2) - (toolbarRect.width / 2);
          placement = 'below';
        }
      }
    }

    // Universal viewport clamp (both axes). The placement logic above only
    // guards the cross-axis; the 'below'/'right' fallbacks can still resolve to
    // a main-axis position that overflows the viewport when the item fills (or
    // exceeds) the canvas — e.g. a full-bleed image whose bottom edge sits below
    // the fold. Clamping both axes keeps the toolbar fully on-screen and
    // reachable, overlapping the item when no off-item slot fits.
    const maxLeft = Math.max(gap, viewportWidth - toolbarRect.width - gap);
    const maxTop = Math.max(gap, viewportHeight - toolbarRect.height - gap);
    left = Math.min(Math.max(left, gap), maxLeft);
    top = Math.min(Math.max(top, gap), maxTop);

    log.debug('useToolbarPosition', 'placement resolved', { placement, top, left });
    setPosition({ top, left, placement });
  }, [geometry, canvasRect, toolbarRef, gap]);

  // Publish placement so SelectionFrame can flip the rotate handle stem to
  // the opposite side. Cleared on unmount to avoid stale reads when no
  // toolbar is active (e.g. between selections).
  const placement = position?.placement ?? null;
  useEffect(() => {
    useSelectionToolbarPlacementStore.getState().setPlacement(placement);
    return () => {
      useSelectionToolbarPlacementStore.getState().setPlacement(null);
    };
  }, [placement]);

  return position;
}
