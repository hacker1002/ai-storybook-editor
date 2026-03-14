// types.ts - Component-scoped context & toolbar types for CanvasSpreadView
// Domain types moved to @/types/canvas-types.ts and @/types/spread-types.ts

import type { RefObject } from "react";
import type {
  Point,
  Geometry,
  Typography,
  ShapeFill,
  ShapeOutline,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  PageData,
  SpreadImage,
  SpreadTextbox,
  BaseSpread,
  ItemType,
} from "@/types/spread-types";
import type {
  ViewMode,
  SelectedElementType,
  ResizeHandle,
  ThumbnailListLayout,
  TextureOption,
  LayoutOption,
  SelectedElement,
  SpreadItemActionUnion,
  OnUpdateSpreadItemFn,
} from "@/types/canvas-types";

// Re-export all domain types for backward compat within this component family
export type {
  // From spread-types
  Point,
  Geometry,
  Typography,
  ShapeFill,
  ShapeOutline,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  PageData,
  SpreadImage,
  SpreadTextbox,
  BaseSpread,
  ItemType,
  // From canvas-types
  ViewMode,
  SelectedElementType,
  ResizeHandle,
  ThumbnailListLayout,
  TextureOption,
  LayoutOption,
  SelectedElement,
  SpreadItemActionUnion,
  OnUpdateSpreadItemFn,
};

// Re-export action subtypes
export type {
  SpreadItemType,
  SpreadItemActionType,
  SpreadItemActionParams,
  ImageAddAction,
  ImageUpdateAction,
  ImageDeleteAction,
  TextAddAction,
  TextUpdateAction,
  TextDeleteAction,
  ShapeAddAction,
  ShapeUpdateAction,
  ShapeDeleteAction,
  VideoAddAction,
  VideoUpdateAction,
  VideoDeleteAction,
  AudioAddAction,
  AudioUpdateAction,
  AudioDeleteAction,
  PageUpdateAction,
} from "@/types/canvas-types";

// === Context Interfaces (component-scoped — stay here) ===
export interface BaseItemContext<TSpread extends BaseSpread> {
  item: unknown;
  itemIndex: number;
  spreadId: string;
  spread: TSpread;
  isSelected: boolean;
  isSpreadSelected: boolean;
}

export interface ImageItemContext<TSpread extends BaseSpread>
  extends BaseItemContext<TSpread> {
  item: SpreadImage;
  onSelect: () => void;
  onUpdate: (updates: Partial<SpreadImage>) => void;
  onDelete: () => void;
  onArtNoteChange?: (artNote: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
}

export interface TextItemContext<TSpread extends BaseSpread>
  extends BaseItemContext<TSpread> {
  item: SpreadTextbox;
  onSelect: () => void;
  onTextChange: (text: string) => void;
  onUpdate: (updates: Partial<SpreadTextbox>) => void;
  onDelete: () => void;
  onEditingChange?: (isEditing: boolean) => void;
}

export interface ShapeItemContext<TSpread extends BaseSpread>
  extends BaseItemContext<TSpread> {
  item: SpreadShape;
  onSelect: () => void;
  onUpdate: (updates: Partial<SpreadShape>) => void;
  onDelete: () => void;
}

export interface VideoItemContext<TSpread extends BaseSpread>
  extends BaseItemContext<TSpread> {
  item: SpreadVideo;
  isThumbnail?: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<SpreadVideo>) => void;
  onDelete: () => void;
}

export interface AudioItemContext<TSpread extends BaseSpread>
  extends BaseItemContext<TSpread> {
  item: SpreadAudio;
  isThumbnail?: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<SpreadAudio>) => void;
  onDelete: () => void;
}

// === Toolbar Contexts ===
export interface BaseToolbarContext {
  selectedGeometry: Geometry | null;
  canvasRef: RefObject<HTMLDivElement | null>;
}

export interface PageToolbarContext<TSpread extends BaseSpread> {
  page: PageData;
  pageIndex: number;
  position: "left" | "right" | "single";
  spread: TSpread;
  spreadId: string;
  isSelected: boolean;
  onUpdateLayout: (layoutId: string) => void;
  onUpdateColor: (color: string) => void;
  onUpdateTexture: (texture: TextureOption) => void;
  availableLayouts: LayoutOption[];
  availableTextures: TextureOption[];
  isLayoutLocked: boolean;
}

export interface ImageToolbarContext<TSpread extends BaseSpread>
  extends ImageItemContext<TSpread>,
    BaseToolbarContext {
  onGenerateImage: () => void;
  onReplaceImage: () => void;
  onClone?: () => void;
}

export interface TextToolbarContext<TSpread extends BaseSpread>
  extends TextItemContext<TSpread>,
    BaseToolbarContext {
  onFormatText: (format: Partial<Typography>) => void;
  onClone?: () => void;
}

export interface ShapeToolbarContext<TSpread extends BaseSpread>
  extends ShapeItemContext<TSpread>,
    BaseToolbarContext {
  onUpdateFill: (fill: Partial<ShapeFill>) => void;
  onUpdateOutline: (outline: Partial<ShapeOutline>) => void;
}

export interface VideoToolbarContext<TSpread extends BaseSpread>
  extends VideoItemContext<TSpread>,
    BaseToolbarContext {
  onReplaceVideo: () => void;
}

export interface AudioToolbarContext<TSpread extends BaseSpread>
  extends AudioItemContext<TSpread>,
    BaseToolbarContext {
  onReplaceAudio: () => void;
}
