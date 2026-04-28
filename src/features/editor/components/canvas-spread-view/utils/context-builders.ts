// utils/context-builders.ts - Context factory functions for render props

import type {
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAutoPic,
  SpreadAudio,
  SpreadQuiz,
  ImageItemContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AutoPicItemContext,
  AudioItemContext,
  QuizItemContext,
  TextToolbarContext,
  SelectedElement,
  SelectedElementType,
  Geometry,
  Typography,
  SpreadItemActionUnion,
} from "@/types/canvas-types";
import { getTextboxContentForLanguage } from "../../../utils/textbox-helpers";
import type { TypographySettings } from "@/types/editor";
import type { RefObject } from "react";

type SpreadItemActionHandler = (
  params: Omit<SpreadItemActionUnion, "spreadId">
) => void;
type SelectFn = (element: SelectedElement, rect?: DOMRect) => void;

/**
 * Build image item context for render props
 */
export function buildImageContext<TSpread extends BaseSpread>(
  image: SpreadImage,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler,
  onEditingChange?: (isEditing: boolean) => void,
  elementType: SelectedElementType = "image"
): ImageItemContext<TSpread> {
  return {
    item: image,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected:
      selectedElement?.type === elementType && selectedElement.index === index,
    isSpreadSelected: true,
    onSelect: (rect?: DOMRect) => onSelect({ type: elementType, index }, rect),
    onUpdate: (updates) =>
      onAction({
        itemType: "image",
        action: "update",
        itemId: image.id,
        data: updates,
      }),
    onDelete: () =>
      onAction({
        itemType: "image",
        action: "delete",
        itemId: image.id,
        data: null,
      }),
    onArtNoteChange: (artNote) =>
      onAction({
        itemType: "image",
        action: "update",
        itemId: image.id,
        data: { art_note: artNote },
      }),
    onEditingChange,
  };
}

/**
 * Build text item context for render props
 */
export function buildTextContext<TSpread extends BaseSpread>(
  textbox: SpreadTextbox,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler,
  onEditingChange?: (isEditing: boolean) => void,
  langCode?: string,
  elementType: SelectedElementType = "textbox",
  bookTypography?: Record<string, TypographySettings> | null
): TextItemContext<TSpread> {
  const result = langCode
    ? getTextboxContentForLanguage(textbox, langCode, bookTypography)
    : null;
  const langKey = result?.langKey;
  const langContent = result?.content;

  return {
    item: textbox,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected:
      selectedElement?.type === elementType && selectedElement.index === index,
    isSpreadSelected: true,
    onSelect: (rect?: DOMRect) => onSelect({ type: elementType, index }, rect),
    onTextChange: (text) => {
      if (!langKey) return;
      onAction({
        itemType: "textbox",
        action: "update",
        itemId: textbox.id,
        data: { [langKey]: { ...langContent, text } } as Partial<SpreadTextbox>,
      });
    },
    onUpdate: (updates) =>
      onAction({
        itemType: "textbox",
        action: "update",
        itemId: textbox.id,
        data: updates,
      }),
    onDelete: () =>
      onAction({
        itemType: "textbox",
        action: "delete",
        itemId: textbox.id,
        data: null,
      }),
    onEditingChange,
  };
}

/**
 * Build text toolbar context with formatting callbacks
 */
export function buildTextToolbarContext<TSpread extends BaseSpread>(
  textbox: SpreadTextbox,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler,
  canvasRef: RefObject<HTMLDivElement | null>,
  selectedGeometry: Geometry | null,
  onEditingChange?: (isEditing: boolean) => void,
  langCode?: string,
  elementType: SelectedElementType = "textbox",
  bookTypography?: Record<string, TypographySettings> | null
): TextToolbarContext<TSpread> {
  const result = langCode
    ? getTextboxContentForLanguage(textbox, langCode, bookTypography)
    : null;
  const langKey = result?.langKey;
  const langContent = result?.content;

  const baseContext = buildTextContext(
    textbox,
    index,
    spread,
    selectedElement,
    onSelect,
    onAction,
    onEditingChange,
    langCode,
    elementType,
    bookTypography
  );

  return {
    ...baseContext,
    selectedGeometry,
    canvasRef,
    onFormatText: (format: Partial<Typography>) => {
      if (!langKey) return;
      onAction({
        itemType: "textbox",
        action: "update",
        itemId: textbox.id,
        data: {
          [langKey]: {
            ...langContent,
            typography: { ...langContent?.typography, ...format },
          },
        } as Partial<SpreadTextbox>,
      });
    },
    onClone: () => {
      const clonedItem: SpreadTextbox = structuredClone(textbox);
      clonedItem.id = crypto.randomUUID();

      // Offset geometry for current language in the clone
      if (langCode) {
        const cloneResult = getTextboxContentForLanguage(clonedItem, langCode, bookTypography);
        if (cloneResult) {
          const cloneContent = cloneResult.content;
          const maxX = Math.max(0, 100 - cloneContent.geometry.w);
          const maxY = Math.max(0, 100 - cloneContent.geometry.h);
          cloneContent.geometry.x = Math.min(maxX, cloneContent.geometry.x + 5);
          cloneContent.geometry.y = Math.min(maxY, cloneContent.geometry.y + 5);
          (clonedItem as Record<string, unknown>)[cloneResult.langKey] =
            cloneContent;
        }
      }

      onAction({
        itemType: "textbox",
        action: "add",
        itemId: null,
        data: clonedItem,
      });
    },
  };
}

/**
 * Build shape item context for render props
 */
export function buildShapeContext<TSpread extends BaseSpread>(
  shape: SpreadShape,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler
): ShapeItemContext<TSpread> {
  return {
    item: shape,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected:
      selectedElement?.type === "shape" && selectedElement.index === index,
    isSpreadSelected: true,
    onSelect: () => onSelect({ type: "shape", index }),
    onUpdate: (updates) =>
      onAction({
        itemType: "shape",
        action: "update",
        itemId: shape.id,
        data: updates,
      }),
    onDelete: () =>
      onAction({
        itemType: "shape",
        action: "delete",
        itemId: shape.id,
        data: null,
      }),
  };
}

/**
 * Build video item context for render props
 */
export function buildVideoContext<TSpread extends BaseSpread>(
  video: SpreadVideo,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler,
  isThumbnail = false
): VideoItemContext<TSpread> {
  return {
    item: video,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected:
      selectedElement?.type === "video" && selectedElement.index === index,
    isSpreadSelected: true,
    isThumbnail,
    onSelect: () => onSelect({ type: "video", index }),
    onUpdate: (updates) =>
      onAction({
        itemType: "video",
        action: "update",
        itemId: video.id,
        data: updates,
      }),
    onDelete: () =>
      onAction({
        itemType: "video",
        action: "delete",
        itemId: video.id,
        data: null,
      }),
  };
}

/**
 * Build audio item context for render props
 */
export function buildAudioContext<TSpread extends BaseSpread>(
  audio: SpreadAudio,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler,
  isThumbnail = false
): AudioItemContext<TSpread> {
  return {
    item: audio,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected:
      selectedElement?.type === "audio" && selectedElement.index === index,
    isSpreadSelected: true,
    isThumbnail,
    onSelect: () => onSelect({ type: "audio", index }),
    onUpdate: (updates) =>
      onAction({
        itemType: "audio",
        action: "update",
        itemId: audio.id,
        data: updates,
      }),
    onDelete: () =>
      onAction({
        itemType: "audio",
        action: "delete",
        itemId: audio.id,
        data: null,
      }),
  };
}

/**
 * Build view-only image context for thumbnails
 */
export function buildViewOnlyImageContext<TSpread extends BaseSpread>(
  image: SpreadImage,
  index: number,
  spread: TSpread
): ImageItemContext<TSpread> {
  return {
    item: image,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: false,
    isSpreadSelected: false,
    onSelect: () => {},
    onUpdate: () => {},
    onDelete: () => {},
  };
}

/**
 * Build view-only text context for thumbnails
 */
export function buildViewOnlyTextContext<TSpread extends BaseSpread>(
  textbox: SpreadTextbox,
  index: number,
  spread: TSpread
): TextItemContext<TSpread> {
  return {
    item: textbox,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: false,
    isSpreadSelected: false,
    onSelect: () => {},
    onTextChange: () => {},
    onUpdate: () => {},
    onDelete: () => {},
    onEditingChange: () => {},
  };
}

/**
 * Build view-only shape context for thumbnails
 */
export function buildViewOnlyShapeContext<TSpread extends BaseSpread>(
  shape: SpreadShape,
  index: number,
  spread: TSpread
): ShapeItemContext<TSpread> {
  return {
    item: shape,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: false,
    isSpreadSelected: false,
    onSelect: () => {},
    onUpdate: () => {},
    onDelete: () => {},
  };
}

/**
 * Build view-only video context for thumbnails
 */
export function buildViewOnlyVideoContext<TSpread extends BaseSpread>(
  video: SpreadVideo,
  index: number,
  spread: TSpread
): VideoItemContext<TSpread> {
  return {
    item: video,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: false,
    isSpreadSelected: false,
    isThumbnail: true,
    onSelect: () => {},
    onUpdate: () => {},
    onDelete: () => {},
  };
}

/**
 * Build view-only audio context for thumbnails
 */
export function buildViewOnlyAudioContext<TSpread extends BaseSpread>(
  audio: SpreadAudio,
  index: number,
  spread: TSpread
): AudioItemContext<TSpread> {
  return {
    item: audio,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: false,
    isSpreadSelected: false,
    isThumbnail: true,
    onSelect: () => {},
    onUpdate: () => {},
    onDelete: () => {},
  };
}

/**
 * Build animated pic item context for render props
 */
export function buildAutoPicContext<TSpread extends BaseSpread>(
  autoPic: SpreadAutoPic,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler,
  isThumbnail = false
): AutoPicItemContext<TSpread> {
  return {
    item: autoPic,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected:
      selectedElement?.type === "auto_pic" && selectedElement.index === index,
    isSpreadSelected: true,
    isThumbnail,
    onSelect: () => onSelect({ type: "auto_pic", index }),
    onUpdate: (updates) =>
      onAction({
        itemType: "auto_pic",
        action: "update",
        itemId: autoPic.id,
        data: updates,
      }),
    onDelete: () =>
      onAction({
        itemType: "auto_pic",
        action: "delete",
        itemId: autoPic.id,
        data: null,
      }),
  };
}

/**
 * Build view-only animated pic context for thumbnails
 */
export function buildViewOnlyAutoPicContext<TSpread extends BaseSpread>(
  autoPic: SpreadAutoPic,
  index: number,
  spread: TSpread
): AutoPicItemContext<TSpread> {
  return {
    item: autoPic,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: false,
    isSpreadSelected: false,
    isThumbnail: true,
    onSelect: () => {},
    onUpdate: () => {},
    onDelete: () => {},
  };
}

/**
 * Build quiz item context for render props
 */
export function buildQuizContext<TSpread extends BaseSpread>(
  quiz: SpreadQuiz,
  index: number,
  spread: TSpread,
  selectedElement: SelectedElement | null,
  onSelect: SelectFn,
  onAction: SpreadItemActionHandler
): QuizItemContext<TSpread> {
  return {
    item: quiz,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected:
      selectedElement?.type === "quiz" && selectedElement.index === index,
    isSpreadSelected: true,
    onSelect: () => onSelect({ type: "quiz", index }),
    onUpdate: (updates) =>
      onAction({
        itemType: "quiz",
        action: "update",
        itemId: quiz.id,
        data: updates,
      }),
    onDelete: () =>
      onAction({
        itemType: "quiz",
        action: "delete",
        itemId: quiz.id,
        data: null,
      }),
  };
}

/**
 * Build view-only quiz context for thumbnails
 */
export function buildViewOnlyQuizContext<TSpread extends BaseSpread>(
  quiz: SpreadQuiz,
  index: number,
  spread: TSpread
): QuizItemContext<TSpread> {
  return {
    item: quiz,
    itemIndex: index,
    spreadId: spread.id,
    spread,
    isSelected: false,
    isSpreadSelected: false,
    onSelect: () => {},
    onUpdate: () => {},
    onDelete: () => {},
  };
}
