// types.ts - Core type definitions

// === Re-export all shared types ===
import type {
  Geometry,
  Typography,
  Fill,
  Outline,
  SpreadObject,
  PageData,
  SpreadImage,
  SpreadTextbox,
  BaseSpread,
} from "../shared";

export type {
  Point,
  Geometry,
  Typography,
  Fill,
  Outline,
  SpreadObject,
  PageData,
  SpreadImage,
  SpreadTextbox,
  BaseSpread,
} from "../shared";

// === Enums & Literals ===
export type ViewMode = "edit" | "grid";
export type ItemType = "image" | "text" | "object";
export type SelectedElementType =
  | "image"
  | "textbox"
  | "object"
  | "page";
export type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
export type ThumbnailListLayout = "horizontal" | "grid";
export type TextureOption = "paper" | "canvas" | "linen" | "watercolor" | null;

export interface LayoutOption {
  id: string;
  title: string;
  thumbnail_url: string;
  type: 1 | 2;
}

// === Selection State ===
export interface SelectedElement {
  type: SelectedElementType;
  index: number;
}

// === Context Interfaces ===
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

export interface ObjectItemContext<TSpread extends BaseSpread>
  extends BaseItemContext<TSpread> {
  item: SpreadObject;
  onSelect: () => void;
  onUpdate: (updates: Partial<SpreadObject>) => void;
  onDelete: () => void;
}

// === Toolbar Contexts ===
import type { RefObject } from "react";

// Base toolbar context with positioning data
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
  onUpdateBackground?: (bg: Partial<Fill>) => void;
  onUpdateOutline?: (outline: Partial<Outline>) => void;
}

export interface ObjectToolbarContext<TSpread extends BaseSpread>
  extends ObjectItemContext<TSpread>,
    BaseToolbarContext {
  onRotate?: () => void;
  onCut?: () => void;
  onCrop?: () => void;
  onGenerate?: () => void;
}
