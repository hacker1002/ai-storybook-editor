import { useState, useLayoutEffect, useEffect, useRef, type RefObject } from "react";
import type { Geometry } from "../types";
import { geometryToScreenRect } from "../utils/coordinate-utils";

interface UseToolbarPositionOptions {
  geometry: Geometry | null;
  canvasRef: RefObject<HTMLElement | null>;
  toolbarRef: RefObject<HTMLDivElement | null>;
  gap?: number;
}

interface ToolbarPosition {
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
  const [position, setPosition] = useState<ToolbarPosition | null>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Track canvas rect changes via ResizeObserver (handles resize/scroll)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateCanvasRect = () => {
      setCanvasRect(canvas.getBoundingClientRect());
    };

    // Initial measurement
    updateCanvasRect();

    // ResizeObserver for size changes
    resizeObserverRef.current = new ResizeObserver(updateCanvasRect);
    resizeObserverRef.current.observe(canvas);

    // Scroll listener for position changes
    const scrollHandler = () => updateCanvasRect();
    window.addEventListener('scroll', scrollHandler, { passive: true });

    return () => {
      resizeObserverRef.current?.disconnect();
      window.removeEventListener('scroll', scrollHandler);
    };
  }, [canvasRef]);

  // Calculate toolbar position from geometry + canvasRect
  useLayoutEffect(() => {
    if (!geometry || !canvasRect || !toolbarRef.current) {
      setPosition(null);
      return;
    }

    // Calculate item rect from geometry (no DOM query needed)
    const itemRect = geometryToScreenRect(geometry, canvasRect);

    const toolbar = toolbarRef.current;
    const toolbarRect = toolbar.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;
    let placement: 'above' | 'below' | 'left' | 'right' = 'above';

    // Priority: above > left > right > below

    // Try ABOVE first (default)
    const topAbove = itemRect.top - toolbarRect.height - gap;
    if (topAbove >= gap) {
      top = topAbove;
      left = itemRect.left + (itemRect.width / 2) - (toolbarRect.width / 2);
      placement = 'above';
    }
    // Try LEFT second
    else {
      const leftPosition = itemRect.left - toolbarRect.width - gap;
      if (leftPosition >= gap) {
        left = leftPosition;
        top = itemRect.top + (itemRect.height / 2) - (toolbarRect.height / 2);
        placement = 'left';
      }
      // Try RIGHT third
      else {
        const rightPosition = itemRect.right + gap;
        if (rightPosition + toolbarRect.width <= viewportWidth - gap) {
          left = rightPosition;
          top = itemRect.top + (itemRect.height / 2) - (toolbarRect.height / 2);
          placement = 'right';
        }
        // Fallback to BELOW
        else {
          top = itemRect.bottom + gap;
          left = itemRect.left + (itemRect.width / 2) - (toolbarRect.width / 2);
          placement = 'below';
        }
      }
    }

    // Boundary adjustments for horizontal centering (above/below placements)
    if (placement === 'above' || placement === 'below') {
      if (left < gap) {
        left = gap;
      }
      if (left + toolbarRect.width > viewportWidth - gap) {
        left = viewportWidth - toolbarRect.width - gap;
      }
    }

    // Boundary adjustments for vertical centering (left/right placements)
    if (placement === 'left' || placement === 'right') {
      if (top < gap) {
        top = gap;
      }
      if (top + toolbarRect.height > viewportHeight - gap) {
        top = viewportHeight - toolbarRect.height - gap;
      }
    }

    setPosition({ top, left, placement });
  }, [geometry, canvasRect, toolbarRef, gap]);

  return position;
}
