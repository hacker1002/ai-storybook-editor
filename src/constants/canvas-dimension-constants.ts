// canvas-dimension-constants.ts - Canvas dimension presets from book.dimension field
// Canvas = full spread (2 pages side-by-side). CANVAS_SIZE width = page width × 2.

import type { CanvasSize } from '@/types/canvas-types';

/** Page size for editor display (1/4 print @300dpi) — single page dimensions */
export const DIMENSION_PAGE_SIZE: Record<number, CanvasSize> = {
  1: { width: 638, height: 638 },  // Square 8.5×8.5
  2: { width: 600, height: 750 },  // Portrait 8×10
  3: { width: 449, height: 676 },  // Portrait 6×9
  4: { width: 638, height: 824 },  // Portrait 8.5×11
  5: { width: 620, height: 877 },  // Portrait A4
  6: { width: 620, height: 620 },  // Square 8.25×8.25
  7: { width: 600, height: 600 },  // Square 8×8
};

/** Canvas (spread) size for editor — full spread = 2 pages side-by-side (page width × 2) */
export const DIMENSION_CANVAS_SIZE: Record<number, CanvasSize> = {
  1: { width: 1276, height: 638 },  // Square 8.5×8.5
  2: { width: 1200, height: 750 },  // Portrait 8×10
  3: { width: 898,  height: 676 },  // Portrait 6×9
  4: { width: 1276, height: 824 },  // Portrait 8.5×11
  5: { width: 1240, height: 877 },  // Portrait A4
  6: { width: 1240, height: 620 },  // Square 8.25×8.25
  7: { width: 1200, height: 600 },  // Square 8×8
};

/** Legacy spread fallback for books without dimension set (800×600 = original hardcoded spread size) */
export const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 800, height: 600 };
