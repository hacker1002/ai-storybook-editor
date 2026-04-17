// canvas-math-utils.ts - Pure math utilities for canvas dimension calculations

import type { CanvasSize, BleedCanvasSize } from '@/types/canvas-types';
import { DIMENSION_CANVAS_SIZE, DIMENSION_PAGE_SIZE, DEFAULT_CANVAS_SIZE } from '@/constants/canvas-dimension-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Util', 'CanvasMathUtils');

// 1/4 print @300dpi → 75dpi. Bleed pixel count is dpi-independent of page width.
const PX_PER_MM = 75 / 25.4;

/** Resolve canvas size from book.dimension field. Falls back to 800×600 for legacy books. */
export function resolveCanvasSize(dimension: number | null): CanvasSize {
  if (dimension === null) return DEFAULT_CANVAS_SIZE;
  const size = DIMENSION_CANVAS_SIZE[dimension];
  if (!size) {
    log.warn('resolveCanvasSize', 'unknown dimension, using default', { dimension });
    return DEFAULT_CANVAS_SIZE;
  }
  return size;
}

/** Canvas aspect ratio (width / height) */
export function getAspectRatio(width: number, height: number): number {
  return width / height;
}

/** Scale factor to fit canvas into a container (containerWidth / canvasWidth) */
export function getScaleFactor(containerWidth: number, canvasWidth: number): number {
  return containerWidth / canvasWidth;
}

/**
 * Resolves bleed canvas geometry from book dimension + bleedMm.
 * bleedPxSide = bleedMm × (75dpi / 25.4mm/in) — same for all dimensions (uniform dpi).
 * bleed.width/height = trim + 2 × bleedPxSide (left+right, top+bottom).
 * bleedPct = per-side bleed as % of trim dimension — used by overlay and clamp logic.
 */
export function resolveBleedCanvasSize(
  dimension: number | null,
  bleedMm: number = 3
): BleedCanvasSize {
  const trim = resolveCanvasSize(dimension);
  const bleedPxSide = bleedMm * PX_PER_MM;
  const bleed: CanvasSize = {
    width: trim.width + bleedPxSide * 2,
    height: trim.height + bleedPxSide * 2,
  };
  const bleedPct = {
    x: (bleedPxSide / trim.width) * 100,
    y: (bleedPxSide / trim.height) * 100,
  };
  log.debug('resolveBleedCanvasSize', 'resolved', {
    dimension, bleedMm, bleedPxSide,
    trimW: trim.width, trimH: trim.height,
    bleedPctX: bleedPct.x.toFixed(2), bleedPctY: bleedPct.y.toFixed(2),
  });
  return { trim, bleed, bleedPct };
}

// Re-export DIMENSION_PAGE_SIZE for consumers that need page-level sizing
export { DIMENSION_PAGE_SIZE };
