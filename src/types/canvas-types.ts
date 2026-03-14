// canvas-types.ts - Domain types for canvas spread view (component-scoped context types stay in component)

import type {
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
export type SpreadItemType = 'page' | 'image' | 'text' | 'shape' | 'video' | 'audio';
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
export type TextAddAction = SpreadItemActionParams<SpreadTextbox> & {
  itemType: 'text';
  action: 'add';
  itemId: null;
};

export type TextUpdateAction = SpreadItemActionParams<Partial<SpreadTextbox>> & {
  itemType: 'text';
  action: 'update';
  itemId: string;
};

export type TextDeleteAction = SpreadItemActionParams<null> & {
  itemType: 'text';
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
  | TextAddAction
  | TextUpdateAction
  | TextDeleteAction
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
};
