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

/** Options to retarget the spawn (raw/illustration space vs retouch/objects). */
export interface BuildExtractImagesOptions {
  /** Add action to call per image. Default `actions.addRetouchImage` (Objects/retouch space). */
  addImage?: (spreadId: string, image: SpreadImage) => void;
  /** z-index tier for cascade. `null` → omit z-index (raw_images don't cascade). Default 'pictorial'. */
  zTier?: "pictorial" | null;
}

/**
 * Spawn N new SpreadImages from committed extract results.
 * - Segments (append N=1) / Layers (replace N): full-screen sources copy geometry, otherwise
 *   stagger +5px per result.
 * - Objects / Crops (crop-on-extract): `meta.geometry` (box % of source) → position the crop at
 *   its exact spot within the source footprint (NO stagger); `meta.tag` → `layer.tags[]` (Crops
 *   carries no tag).
 * z = next top of the pictorial tier, clamped to MEDIA.max. No auto-select (N>1 consistent).
 * Pass `options` to retarget the raw/illustration space (addRawImage + no z-tier).
 */
export function buildExtractImages(
  results: ExtractResult[],
  sourceImage: SpreadImage,
  sourceSpreadId: string,
  spreads: BaseSpread[],
  actions: SnapshotActions,
  options: BuildExtractImagesOptions = {}
): void {
  const { addImage = actions.addRetouchImage, zTier = "pictorial" } = options;
  const orig = sourceImage.geometry;
  const isFullScreen = orig.w >= 100 && orig.h >= 100;
  const spread = spreads.find((s) => s.id === sourceSpreadId);

  const firstZ =
    zTier && spread
      ? nextTopZInTier(spread, zTier, { count: results.length })
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
      // raw_images don't cascade (zTier null) → omit z-index; retouch images carry it.
      ...(zTier ? { "z-index": Math.min(firstZ + index, LAYER_CONFIG.MEDIA.max) } : {}),
    };
    addImage(sourceSpreadId, newImage);
  });

  log.info("buildExtractImages", "created images from extract", {
    count: results.length,
    spreadId: sourceSpreadId,
    firstZ,
    isFullScreen,
    geometryPositioned: results.filter((r) => r.meta?.geometry).length,
  });
}
