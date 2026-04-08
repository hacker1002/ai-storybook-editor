// use-container-fit.ts - Compute zoom level that fits spread into container
import { useState, useEffect, type RefObject } from 'react';
import type { PlayerOrientation } from './use-player-orientation';
import type { FullPageMode } from '../player-canvas';

// Sidebar/bottom bar dimension (w-14 = 56px)
const CONTROL_BAR_SIZE = 56;

/**
 * Measures container and computes a zoom level (percentage) that makes the
 * spread fit within the available space while maintaining aspect ratio.
 *
 * When fullPageMode is 'left' or 'right', fits half the canvas width instead
 * so a single page fills the viewport.
 *
 * Returns null when disabled (editor mode) — caller uses its own zoomLevel.
 */
export function useContainerFit(
  containerRef: RefObject<HTMLElement | null>,
  canvasWidth: number,
  canvasHeight: number,
  orientation: PlayerOrientation,
  enabled: boolean,
  fullPageMode: FullPageMode = 'spread',
): number | null {
  const [fitZoom, setFitZoom] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setFitZoom(null);
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const rect = el.getBoundingClientRect();

      let availableW: number;
      let availableH: number;

      if (orientation === 'portrait') {
        // Control bar at bottom — full width, subtract bar height
        availableW = rect.width;
        availableH = rect.height - CONTROL_BAR_SIZE;
      } else {
        // Control bar on right — full height, subtract bar width
        availableW = rect.width - CONTROL_BAR_SIZE;
        availableH = rect.height;
      }

      if (availableW <= 0 || availableH <= 0 || canvasWidth <= 0 || canvasHeight <= 0) return;

      // Full page mode: fit half the canvas width (one page) to available width
      const effectiveCanvasW = fullPageMode !== 'spread' ? canvasWidth / 2 : canvasWidth;
      const scale = Math.min(availableW / effectiveCanvasW, availableH / canvasHeight);
      // Convert to zoom percentage (e.g. 0.31 → 31)
      setFitZoom(scale * 100);
    };

    compute();

    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, canvasWidth, canvasHeight, orientation, enabled, fullPageMode]);

  return fitZoom;
}
