// use-toolbar-position.ts - Shared hook for positioning toolbars relative to selected elements

import { useState, useLayoutEffect, useEffect, useRef, type RefObject } from "react";
import type { Geometry } from "../types";
import { geometryToScreenRect } from "../utils/coordinate-utils";

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

    // Boundary adjustments
    if (placement === 'above' || placement === 'below') {
      if (left < gap) left = gap;
      if (left + toolbarRect.width > viewportWidth - gap) {
        left = viewportWidth - toolbarRect.width - gap;
      }
    }

    if (placement === 'left' || placement === 'right') {
      if (top < gap) top = gap;
      if (top + toolbarRect.height > viewportHeight - gap) {
        top = viewportHeight - toolbarRect.height - gap;
      }
    }

    setPosition({ top, left, placement });
  }, [geometry, canvasRect, toolbarRef, gap]);

  return position;
}
