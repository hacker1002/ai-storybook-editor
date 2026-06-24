// use-image-builders.ts - Plain builder functions for extract image creation
// Exported as functions (not a hook) — callsite wraps with useCallback + modal state

import { createLogger } from "@/utils/logger";
import { nextTopZInTier } from "@/features/editor/utils/duplicate-item-helpers";
import { LAYER_CONFIG } from "@/constants/spread-constants";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import type { BaseSpread, SpreadImage } from "@/types/canvas-types";
import type { ExtractResult } from "@/features/editor/components/shared-components";

const log = createLogger("Editor", "useImageBuilders");

type SnapshotActions = ReturnType<typeof useSnapshotActions>;

/**
 * Spawn N new SpreadImages from committed extract results.
 * - Segments (append N=1) / Layers (replace N): full-screen sources copy geometry, otherwise
 *   stagger +5px per result.
 * - Objects (crop-on-extract): `meta.geometry` (box % of source) → position the crop at its
 *   exact spot within the source footprint (NO stagger), and `meta.tag` → `layer.tags[]`.
 * z = next top of the pictorial tier, clamped to MEDIA.max. No auto-select (N>1 consistent).
 */
export function buildExtractImages(
  results: ExtractResult[],
  sourceImage: SpreadImage,
  sourceSpreadId: string,
  retouchSpreads: BaseSpread[],
  actions: SnapshotActions
): void {
  const orig = sourceImage.geometry;
  const isFullScreen = orig.w >= 100 && orig.h >= 100;
  const spread = retouchSpreads.find((s) => s.id === sourceSpreadId);

  const firstZ = spread
    ? nextTopZInTier(spread, "pictorial", { count: results.length })
    : LAYER_CONFIG.MEDIA.min;

  results.forEach((result, index) => {
    const box = result.meta?.geometry;
    // Objects: geometry-positioned (box % within source footprint — mirrors buildCropImages).
    // Others: full-screen copy or +5px stagger.
    const geometry = box
      ? {
          x: Math.min(orig.x + (box.x / 100) * orig.w, 99),
          y: Math.min(orig.y + (box.y / 100) * orig.h, 99),
          w: Math.min((box.w / 100) * orig.w, 100),
          h: Math.min((box.h / 100) * orig.h, 100),
        }
      : isFullScreen
        ? { ...orig }
        : {
            x: Math.min(orig.x + 5 * (index + 1), 100 - orig.w),
            y: Math.min(orig.y + 5 * (index + 1), 100 - orig.h),
            w: orig.w,
            h: orig.h,
          };

    const newImage: SpreadImage = {
      id: crypto.randomUUID(),
      title: result.title,
      geometry,
      media_url: result.media_url,
      illustrations: [
        {
          media_url: result.media_url,
          created_time: new Date().toISOString(),
          is_selected: true,
        },
      ],
      // Detect tag → subject identity on the spawned layer (DetectTag ⊂ SpreadTag).
      tags: result.meta?.tag ? [result.meta.tag] : [],
      aspect_ratio: result.meta?.ratio ?? sourceImage.aspect_ratio,
      player_visible: sourceImage.player_visible,
      editor_visible: sourceImage.editor_visible,
      "z-index": Math.min(firstZ + index, LAYER_CONFIG.MEDIA.max),
    };
    actions.addRetouchImage(sourceSpreadId, newImage);
  });

  log.info("buildExtractImages", "created images from extract", {
    count: results.length,
    spreadId: sourceSpreadId,
    firstZ,
    isFullScreen,
    geometryPositioned: results.filter((r) => r.meta?.geometry).length,
  });
}
