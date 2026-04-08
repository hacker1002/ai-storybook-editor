// use-zoom-center-scroll.ts — Preserves the visible canvas center when zoom level changes.
// Tracks which fraction of the canvas is at the viewport center, then after zoom
// changes, adjusts scroll so the same canvas point remains centered.

import { useRef, useCallback, useEffect, useLayoutEffect, type RefObject } from "react";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "useZoomCenterScroll");

/**
 * Keeps the same point on the canvas centered in the scrollable container
 * when the zoom level changes.
 *
 * @param zoomLevel - Current zoom percentage
 * @param canvasRef - Ref to the inner canvas element (the one that scales)
 * @returns containerRef - Attach this to the scrollable outer wrapper
 */
export function useZoomCenterScroll(
  zoomLevel: number,
  canvasRef: RefObject<HTMLDivElement | null>
): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const prevZoomRef = useRef(zoomLevel);
  const scrollCenterRef = useRef({ fracX: 0.5, fracY: 0.5 });

  // Track which fraction of the canvas is at the viewport center
  const updateScrollCenter = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    // Viewport center relative to canvas
    const viewCenterX = containerRect.left + containerRect.width / 2;
    const viewCenterY = containerRect.top + containerRect.height / 2;
    const canvasX = viewCenterX - canvasRect.left;
    const canvasY = viewCenterY - canvasRect.top;

    scrollCenterRef.current = {
      fracX: canvasRect.width > 0 ? Math.max(0, Math.min(1, canvasX / canvasRect.width)) : 0.5,
      fracY: canvasRect.height > 0 ? Math.max(0, Math.min(1, canvasY / canvasRect.height)) : 0.5,
    };
  }, [canvasRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    updateScrollCenter();
    container.addEventListener("scroll", updateScrollCenter);
    return () => container.removeEventListener("scroll", updateScrollCenter);
  }, [updateScrollCenter]);

  // After zoom changes, adjust scroll to keep the same canvas point at viewport center
  useLayoutEffect(() => {
    if (prevZoomRef.current === zoomLevel) return;
    log.debug("zoomAdjust", "adjusting scroll for zoom change", {
      from: prevZoomRef.current,
      to: zoomLevel,
    });
    prevZoomRef.current = zoomLevel;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const { fracX, fracY } = scrollCenterRef.current;

    // Canvas position in scroll coordinate space (works regardless of current scroll)
    const containerRect = container.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const canvasLeftInScroll = canvasRect.left - containerRect.left + container.scrollLeft;
    const canvasTopInScroll = canvasRect.top - containerRect.top + container.scrollTop;

    // Scroll so that fracX/fracY of canvas is at viewport center
    const targetX = canvasLeftInScroll + fracX * canvasRect.width;
    const targetY = canvasTopInScroll + fracY * canvasRect.height;

    container.scrollLeft = Math.max(0, targetX - container.clientWidth / 2);
    container.scrollTop = Math.max(0, targetY - container.clientHeight / 2);
  }, [zoomLevel, canvasRef]);

  return containerRef;
}
