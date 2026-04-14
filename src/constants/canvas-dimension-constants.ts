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
  8: { width: 750, height: 750 },  // Square 10×10
  9: { width: 824, height: 638 },  // Landscape 11×8.5
  10: { width: 676, height: 526 }, // Landscape 9×7
  11: { width: 375, height: 599 }, // Portrait 5×8
  12: { width: 393, height: 599 }, // Portrait 5.25×8
  13: { width: 413, height: 638 }, // Portrait 5.5×8.5
  14: { width: 461, height: 691 }, // Portrait 6.14×9.21
  15: { width: 502, height: 720 }, // Portrait 6.69×9.61
  16: { width: 526, height: 750 }, // Portrait 7×10
  17: { width: 558, height: 726 }, // Portrait 7.44×9.69
  18: { width: 564, height: 694 }, // Portrait 7.5×9.25
  19: { width: 620, height: 449 }, // Landscape 8.25×6
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
  8: { width: 1500, height: 750 }, // Square 10×10
  9: { width: 1648, height: 638 }, // Landscape 11×8.5
  10: { width: 1352, height: 526 }, // Landscape 9×7
  11: { width: 750,  height: 599 }, // Portrait 5×8
  12: { width: 786,  height: 599 }, // Portrait 5.25×8
  13: { width: 826,  height: 638 }, // Portrait 5.5×8.5
  14: { width: 922,  height: 691 }, // Portrait 6.14×9.21
  15: { width: 1004, height: 720 }, // Portrait 6.69×9.61
  16: { width: 1052, height: 750 }, // Portrait 7×10
  17: { width: 1116, height: 726 }, // Portrait 7.44×9.69
  18: { width: 1128, height: 694 }, // Portrait 7.5×9.25
  19: { width: 1240, height: 449 }, // Landscape 8.25×6
};

/** Legacy spread fallback for books without dimension set (800×600 = original hardcoded spread size) */
export const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 800, height: 600 };
