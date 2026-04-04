// canvas-math-utils.ts - Pure math utilities for canvas dimension calculations

import type { CanvasSize } from '@/types/canvas-types';
import { DIMENSION_CANVAS_SIZE, DEFAULT_CANVAS_SIZE } from '@/constants/canvas-dimension-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Util', 'CanvasMathUtils');

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
