// recompute-sheet-preview.ts — Re-runs the pure layout engine on a STORED crop
// sheet so the modal preview reflects the CURRENT engine config (gutters,
// ratios) without recreating the remix or persisting.
//
// WHY: `crop_sheets[]` geometry is frozen at remix-create time
// (`computeCropSheets`). Engine-config changes (e.g. wider gutterX) therefore
// don't show on an already-saved remix until a re-layout runs. This helper
// re-packs LIVE for the preview only — it does NOT persist and does NOT change
// what the AI swap currently receives (that still reads the stored geometry).
//
// Reconstruction is exact: the engine's packing never alters a crop's intrinsic
// w/h (only x/y), so the stored `geometry.w/h` IS the book-spread-relative px
// size. Inverting `toPixels` recovers the original width/height percentages.

import {
  computeCropSheetLayout,
  type CropInput,
} from '@/utils/crop-sheet-layout-engine';
import {
  DIMENSION_CANVAS_SIZE,
  DEFAULT_CANVAS_SIZE,
} from '@/constants/canvas-dimension-constants';
import { createLogger } from '@/utils/logger';
import type { RemixCropSheet } from '@/types/remix';

const log = createLogger('Editor', 'RecomputeSheetPreview');

/** Book spread (px) for the layout engine — mirrors crop-sheet-layout.ts. */
function resolveSpread(dimension: number | null | undefined): {
  width: number;
  height: number;
} {
  if (dimension == null) return DEFAULT_CANVAS_SIZE;
  return DIMENSION_CANVAS_SIZE[dimension] ?? DEFAULT_CANVAS_SIZE;
}

/**
 * Returns a NEW sheet with `sheet_geometry` + per-crop `geometry` re-packed by
 * the current engine. Crop order + all crop metadata are preserved (geometry is
 * matched back by `id`), so the ordinal badges stay stable. Falls back to the
 * input sheet unchanged when it has no crops or the recompute yields nothing.
 */
export function recomputeSheetPreview(
  sheet: RemixCropSheet,
  dimension: number | null | undefined,
): RemixCropSheet {
  if (sheet.crops.length === 0) return sheet;

  const spread = resolveSpread(dimension);
  // RemixCrop has no stable id — use the array index as the engine id so each
  // placement maps back to its source crop by position (also keeps crop order
  // and the ordinal badge stable).
  const inputs: CropInput[] = sheet.crops.map((c, i) => ({
    id: String(i),
    widthPct: (c.geometry.w / spread.width) * 100,
    heightPct: (c.geometry.h / spread.height) * 100,
  }));

  const { sheets } = computeCropSheetLayout(inputs, { sheetCount: 1, spread });
  const packed = sheets[0];
  if (!packed || packed.placements.length === 0) {
    log.warn('recomputeSheetPreview', 'empty re-pack — keep stored geometry', {
      crops: sheet.crops.length,
    });
    return sheet;
  }

  const geomByIdx = new Map(packed.placements.map((p) => [p.id, p.geometry]));
  return {
    ...sheet,
    sheet_geometry: packed.sheetGeometry,
    crops: sheet.crops.map((c, i) => ({
      ...c,
      geometry: geomByIdx.get(String(i)) ?? c.geometry,
    })),
  };
}
