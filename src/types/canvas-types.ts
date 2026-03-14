// canvas-types.ts - Domain types for canvas spread view

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
} from './spread-types';

// === Enums & Literals ===
export type ViewMode = "edit" | "grid";
export type SelectedElementType =
  | "image"
  | "textbox"
  | "shape"
  | "video"
  | "audio"
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

// === Spread Item Action Types ===
export type SpreadItemType = 'page' | 'image' | 'textbox' | 'shape' | 'video' | 'audio';
export type SpreadItemActionType = 'add' | 'update' | 'delete';

export interface SpreadItemActionParams<TData = unknown> {
  spreadId: string;
  itemType: SpreadItemType;
  action: SpreadItemActionType;
  itemId: number | string | null;  // page index: number, other id: string, null for add
  data: TData | null;     // null for delete
}

// Image actions (itemId: string = UUID)
export type ImageAddAction = SpreadItemActionParams<SpreadImage> & {
  itemType: 'image';
  action: 'add';
  itemId: null;
};

export type ImageUpdateAction = SpreadItemActionParams<Partial<SpreadImage>> & {
  itemType: 'image';
  action: 'update';
  itemId: string;
};

export type ImageDeleteAction = SpreadItemActionParams<null> & {
  itemType: 'image';
  action: 'delete';
  itemId: string;
  data: null;
};

// Textbox actions (itemId: string = UUID)
export type TextboxAddAction = SpreadItemActionParams<SpreadTextbox> & {
  itemType: 'textbox';
  action: 'add';
  itemId: null;
};

export type TextboxUpdateAction = SpreadItemActionParams<Partial<SpreadTextbox>> & {
  itemType: 'textbox';
  action: 'update';
  itemId: string;
};

export type TextboxDeleteAction = SpreadItemActionParams<null> & {
  itemType: 'textbox';
  action: 'delete';
  itemId: string;
  data: null;
};

// Shape actions (itemId: string = UUID)
export type ShapeAddAction = SpreadItemActionParams<SpreadShape> & {
  itemType: 'shape';
  action: 'add';
  itemId: null;
};

export type ShapeUpdateAction = SpreadItemActionParams<Partial<SpreadShape>> & {
  itemType: 'shape';
  action: 'update';
  itemId: string;
};

export type ShapeDeleteAction = SpreadItemActionParams<null> & {
  itemType: 'shape';
  action: 'delete';
  itemId: string;
  data: null;
};

// Video actions (itemId: string = UUID)
export type VideoAddAction = SpreadItemActionParams<SpreadVideo> & {
  itemType: 'video';
  action: 'add';
  itemId: null;
};

export type VideoUpdateAction = SpreadItemActionParams<Partial<SpreadVideo>> & {
  itemType: 'video';
  action: 'update';
  itemId: string;
};

export type VideoDeleteAction = SpreadItemActionParams<null> & {
  itemType: 'video';
  action: 'delete';
  itemId: string;
  data: null;
};

// Audio actions (itemId: string = UUID)
export type AudioAddAction = SpreadItemActionParams<SpreadAudio> & {
  itemType: 'audio';
  action: 'add';
  itemId: null;
};

export type AudioUpdateAction = SpreadItemActionParams<Partial<SpreadAudio>> & {
  itemType: 'audio';
  action: 'update';
  itemId: string;
};

export type AudioDeleteAction = SpreadItemActionParams<null> & {
  itemType: 'audio';
  action: 'delete';
  itemId: string;
  data: null;
};

// Page actions (itemId: number = page index 0|1)
export type PageUpdateAction = SpreadItemActionParams<Partial<PageData>> & {
  itemType: 'page';
  action: 'update';
  itemId: number;
};

// Union of all actions
export type SpreadItemActionUnion =
  | ImageAddAction
  | ImageUpdateAction
  | ImageDeleteAction
  | TextboxAddAction
  | TextboxUpdateAction
  | TextboxDeleteAction
  | ShapeAddAction
  | ShapeUpdateAction
  | ShapeDeleteAction
  | VideoAddAction
  | VideoUpdateAction
  | VideoDeleteAction
  | AudioAddAction
  | AudioUpdateAction
  | AudioDeleteAction
  | PageUpdateAction;

// Handler type
export type OnUpdateSpreadItemFn = (params: SpreadItemActionUnion) => void;

// Re-export spread types that canvas consumers commonly need
export type {
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
};

// === Context Interfaces (shared across canvas component group) ===
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
