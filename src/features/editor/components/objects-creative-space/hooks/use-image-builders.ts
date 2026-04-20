// use-image-builders.ts - Plain builder functions for crop/split image creation
// Exported as functions (not a hook) — callsite wraps with useCallback + modal state

import { createLogger } from "@/utils/logger";
import { nextTopZInTier } from "@/features/editor/utils/duplicate-item-helpers";
import { LAYER_CONFIG } from "@/constants/spread-constants";
import { useSnapshotActions } from "@/stores/snapshot-store/selectors";
import type { BaseSpread, SpreadImage } from "@/types/canvas-types";
import type {
  CropCreateResult,
  SplitLayerResult,
  SegmentResult,
} from "@/features/editor/components/shared-components";

const log = createLogger("Editor", "useImageBuilders");

type SnapshotActions = ReturnType<typeof useSnapshotActions>;

export function buildCropImages(
  result: CropCreateResult,
  cropModalImage: SpreadImage,
  cropModalSpreadId: string,
  retouchSpreads: BaseSpread[],
  actions: SnapshotActions
): void {
  const orig = cropModalImage;
  const count = result.croppedObjects.length;

  const spread = retouchSpreads.find((s) => s.id === cropModalSpreadId);
  const firstZ = spread
    ? nextTopZInTier(spread, "pictorial", { count })
    : LAYER_CONFIG.MEDIA.min;

  result.croppedObjects.forEach((obj, i) => {
    const newImage: SpreadImage = {
      id: crypto.randomUUID(),
      title: `${orig.title || "Untitled"} - Crop #${obj.boxIndex + 1}`,
      geometry: {
        x: Math.min(orig.geometry.x + (obj.geometry.x / 100) * orig.geometry.w, 99),
        y: Math.min(orig.geometry.y + (obj.geometry.y / 100) * orig.geometry.h, 99),
        w: Math.min((obj.geometry.w / 100) * orig.geometry.w, 100),
        h: Math.min((obj.geometry.h / 100) * orig.geometry.h, 100),
      },
      media_url: obj.imageUrl,
      illustrations: [
        {
          media_url: obj.imageUrl,
          created_time: new Date().toISOString(),
          is_selected: true,
        },
      ],
      type: "other",
      aspect_ratio: obj.aspectRatio,
      player_visible: orig.player_visible,
      editor_visible: orig.editor_visible,
      "z-index": Math.min(firstZ + i, LAYER_CONFIG.MEDIA.max),
    };
    actions.addRetouchImage(cropModalSpreadId, newImage);
  });

  log.info("buildCropImages", "created new images from crops", {
    croppedCount: count,
    spreadId: cropModalSpreadId,
    firstZ,
  });
}

export function buildSplitImages(
  layers: SplitLayerResult[],
  splitModalImage: SpreadImage,
  splitModalSpreadId: string,
  retouchSpreads: BaseSpread[],
  actions: SnapshotActions
): void {
  const orig = splitModalImage.geometry;
  const isFullScreen = orig.w >= 100 && orig.h >= 100;
  const spread = retouchSpreads.find((s) => s.id === splitModalSpreadId);

  const firstZ = spread
    ? nextTopZInTier(spread, "pictorial", { count: layers.length })
    : LAYER_CONFIG.MEDIA.min;

  layers.forEach((layer, index) => {
    const newImage: SpreadImage = {
      id: crypto.randomUUID(),
      title: layer.title,
      geometry: isFullScreen
        ? { ...orig }
        : {
            x: Math.min(orig.x + 5 * (index + 1), 100 - orig.w),
            y: Math.min(orig.y + 5 * (index + 1), 100 - orig.h),
            w: orig.w,
            h: orig.h,
          },
      media_url: layer.media_url,
      illustrations: [
        {
          media_url: layer.media_url,
          created_time: new Date().toISOString(),
          is_selected: true,
        },
      ],
      type: splitModalImage.type,
      aspect_ratio: splitModalImage.aspect_ratio,
      player_visible: splitModalImage.player_visible,
      editor_visible: splitModalImage.editor_visible,
      "z-index": Math.min(firstZ + index, LAYER_CONFIG.MEDIA.max),
    };
    actions.addRetouchImage(splitModalSpreadId, newImage);
  });

  log.info("buildSplitImages", "created images from split", {
    count: layers.length,
    spreadId: splitModalSpreadId,
    firstZ,
    isFullScreen,
  });
}

export function buildSegmentImage(
  segment: SegmentResult,
  sourceImage: SpreadImage,
  segmentSpreadId: string,
  retouchSpreads: BaseSpread[],
  actions: SnapshotActions,
  onItemSelect: (item: { type: 'image'; id: string }) => void
): void {
  const spread = retouchSpreads.find((s) => s.id === segmentSpreadId);
  const zIndex = spread
    ? nextTopZInTier(spread, "pictorial")
    : LAYER_CONFIG.MEDIA.min;

  const newImage: SpreadImage = {
    id: crypto.randomUUID(),
    title: `${sourceImage.title ?? "Image"} - Segment`,
    geometry: { ...sourceImage.geometry },
    aspect_ratio: sourceImage.aspect_ratio,
    type: sourceImage.type,
    name: sourceImage.name,
    state: sourceImage.state,
    media_url: segment.media_url,
    illustrations: [
      {
        media_url: segment.media_url,
        created_time: new Date().toISOString(),
        is_selected: true,
      },
    ],
    player_visible: true,
    editor_visible: true,
    "z-index": zIndex,
  };

  actions.addRetouchImage(segmentSpreadId, newImage);
  onItemSelect({ type: "image", id: newImage.id });

  log.info("buildSegmentImage", "created segment image", {
    newImageId: newImage.id,
    spreadId: segmentSpreadId,
    zIndex,
  });
}
