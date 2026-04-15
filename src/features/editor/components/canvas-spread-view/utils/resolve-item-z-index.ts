// resolve-item-z-index.ts - Single source of truth for canvas item stacking order
//
// Shared between spread-editor-panel (interactive), spread-thumbnail (read-only),
// and selection-frame (overlay). Keeping the formulas in one place ensures the
// selection frame can mirror the selected item's layer so higher-z items remain
// clickable — see ADR on intra-spread element selection UX.

import { LAYER_CONFIG } from "@/constants/spread-constants";
import type {
  BaseSpread,
  ItemType,
  SpreadImage,
  SpreadVideo,
  SpreadAnimatedPic,
  SpreadAudio,
  SpreadQuiz,
} from "@/types/canvas-types";

export function resolveItemZIndex(
  type: ItemType,
  index: number,
  spread: BaseSpread,
  isIllustrationRawItem?: boolean
): number {
  const rawImageCount = spread.raw_images?.length ?? 0;
  const rawItemCount = (spread.raw_textboxes?.length ?? 0) + rawImageCount;
  const playableImageCount = spread.images?.length ?? 0;
  const totalImageCount = Math.max(rawImageCount, playableImageCount);
  const totalVideoCount = spread.videos?.length ?? 0;
  const shapesCount = spread.shapes?.length ?? 0;
  const audiosCount = spread.audios?.length ?? 0;

  switch (type) {
    // Illustration layer — always below editable layers.
    // Raw items ignore any stored z-index and stack by array order.
    case "raw_image":
      return isIllustrationRawItem
        ? LAYER_CONFIG.MEDIA.min + index
        : -rawItemCount + index;

    case "raw_textbox":
      return isIllustrationRawItem
        ? LAYER_CONFIG.TEXT.min + index
        : -rawItemCount + rawImageCount + index;

    case "image": {
      const img = spread.images?.[index] as SpreadImage | undefined;
      return img?.["z-index"] ?? LAYER_CONFIG.MEDIA.min + index;
    }

    case "video": {
      const video = spread.videos?.[index] as SpreadVideo | undefined;
      return (
        video?.["z-index"] ?? LAYER_CONFIG.MEDIA.min + totalImageCount + index
      );
    }

    case "shape": {
      const shape = spread.shapes?.[index] as
        | { "z-index"?: number }
        | undefined;
      return shape?.["z-index"] ?? LAYER_CONFIG.OBJECTS.min + index;
    }

    case "animated_pic": {
      const animatedPic = spread.animated_pics?.[index] as SpreadAnimatedPic | undefined;
      return (
        animatedPic?.["z-index"] ?? LAYER_CONFIG.MEDIA.min + totalImageCount + totalVideoCount + index
      );
    }

    case "audio": {
      const audio = spread.audios?.[index] as SpreadAudio | undefined;
      return (
        audio?.["z-index"] ?? LAYER_CONFIG.OBJECTS.min + shapesCount + index
      );
    }

    case "quiz": {
      const quiz = spread.quizzes?.[index] as SpreadQuiz | undefined;
      return (
        quiz?.["z-index"] ??
        LAYER_CONFIG.OBJECTS.min + shapesCount + audiosCount + index
      );
    }

    case "textbox": {
      const textbox = spread.textboxes?.[index] as
        | { "z-index"?: number }
        | undefined;
      return textbox?.["z-index"] ?? LAYER_CONFIG.TEXT.min + index;
    }

    default: {
      // Exhaustiveness guard — TS will error if ItemType grows a new member.
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
