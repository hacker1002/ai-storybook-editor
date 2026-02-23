// types.ts - Core type definitions

// === Enums & Literals ===
export type ViewMode = 'edit' | 'grid';
export type ItemType = 'image' | 'text' | 'object' | 'animation';
export type SelectedElementType = 'image' | 'textbox' | 'object' | 'animation' | 'page';
export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
export type ThumbnailListLayout = 'horizontal' | 'grid';
export type TextureOption = 'paper' | 'canvas' | 'linen' | 'watercolor' | null;

// === Geometry Types ===
export interface Point {
  x: number;
  y: number;
}

export interface Geometry {
  x: number;      // percentage 0-100
  y: number;      // percentage 0-100
  w: number;      // percentage 0-100
  h: number;      // percentage 0-100
}

// === Typography ===
export interface Typography {
  size?: number;
  weight?: number;
  style?: 'normal' | 'italic';
  family?: string;
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  decoration?: 'none' | 'underline' | 'line-through';
  textAlign?: 'left' | 'center' | 'right';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
}

// === Fill & Outline ===
export interface Fill {
  color: string;
  opacity: number;
}

export interface Outline {
  color: string;
  width: number;
  radius: number;
  type: 'solid' | 'dashed' | 'dotted';
}

// === Page Types ===
export interface PageData {
  number: string | number;  // DPS: "0-1" | non-DPS: 0, 1
  type: 'normal_page' | 'front_matter' | 'back_matter' | 'dedication';
  layout: string | null;    // UUID FK → template_layouts
  background: {
    color: string;
    texture: string | null;
  };
}

export interface LayoutOption {
  id: string;
  title: string;
  thumbnail_url: string;
  type: 1 | 2;  // 1: double page, 2: single page
}

// === Spread Item Types ===
export interface SpreadImage {
  id: string;
  title?: string;
  geometry: Geometry;
  setting?: string;  // @stage_key/setting_key
  art_note?: string;
  visual_description?: string;
  image_references?: Array<{ title: string; media_url: string }>;
  sketches?: Array<{ media_url: string; created_time: string; is_selected: boolean }>;
  illustrations?: Array<{ media_url: string; created_time: string; is_selected: boolean }>;
  final_hires_media_url?: string;
}

export interface SpreadTextbox {
  id: string;
  title?: string;
  [languageKey: string]: {
    text: string;
    geometry: Geometry;
    typography: Typography;
    fill?: Fill;
    outline?: Outline;
  } | string | undefined;
}

export interface SpreadObject {
  id: string;
  original_image_id?: string;
  name: string;
  state?: string;
  type: 'raw' | 'character' | 'prop' | 'background' | 'foreground' | 'other';
  media_url?: string;
  media_type?: 'image' | 'video' | 'audio';
  geometry: Geometry;
  zIndex: number;
  player_visible: boolean;
  editor_visible: boolean;
}

export interface SpreadAnimation {
  order: number;
  type: 'textbox' | 'image' | 'video' | 'audio';
  target: { id: string; type: 'textbox' | 'object' };
  trigger_type: 'on_click' | 'with_previous' | 'after_previous';
  effect: {
    type: number;
    geometry?: Geometry;
    delay?: number;
    duration?: number;
    loop?: number;
    amount?: number;
    direction?: 'left' | 'right' | 'up' | 'down';
  };
}

// === Base Spread Interface ===
export interface BaseSpread {
  id: string;
  pages: PageData[];
  images: SpreadImage[];
  textboxes: SpreadTextbox[];
  objects?: SpreadObject[];
  animations?: SpreadAnimation[];
  manuscript?: string;
  tiny_sketch_media_url?: string;
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

export interface ImageItemContext<TSpread extends BaseSpread> extends BaseItemContext<TSpread> {
  item: SpreadImage;
  onSelect: () => void;
  onUpdate: (updates: Partial<SpreadImage>) => void;
  onDelete: () => void;
  onArtNoteChange?: (artNote: string) => void;
  onEditingChange?: (isEditing: boolean) => void;
}

export interface TextItemContext<TSpread extends BaseSpread> extends BaseItemContext<TSpread> {
  item: SpreadTextbox;
  onSelect: () => void;
  onTextChange: (text: string) => void;
  onUpdate: (updates: Partial<SpreadTextbox>) => void;
  onDelete: () => void;
  onEditingChange?: (isEditing: boolean) => void;
}

export interface ObjectItemContext<TSpread extends BaseSpread> extends BaseItemContext<TSpread> {
  item: SpreadObject;
  onSelect: () => void;
  onUpdate: (updates: Partial<SpreadObject>) => void;
  onDelete: () => void;
}

export interface AnimationItemContext<TSpread extends BaseSpread> extends BaseItemContext<TSpread> {
  item: SpreadAnimation;
  onSelect: () => void;
  onUpdate: (updates: Partial<SpreadAnimation>) => void;
  onDelete: () => void;
}

// === Toolbar Contexts ===
export interface PageToolbarContext<TSpread extends BaseSpread> {
  page: PageData;
  pageIndex: number;
  position: 'left' | 'right' | 'single';
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

export interface ImageToolbarContext<TSpread extends BaseSpread> extends ImageItemContext<TSpread> {
  onGenerateImage: () => void;
  onReplaceImage: () => void;
}

export interface TextToolbarContext<TSpread extends BaseSpread> extends TextItemContext<TSpread> {
  onFormatText: (format: Partial<Typography>) => void;
}

export interface ObjectToolbarContext<TSpread extends BaseSpread> extends ObjectItemContext<TSpread> {
  onEditObject: () => void;
}

export interface AnimationToolbarContext<TSpread extends BaseSpread> extends AnimationItemContext<TSpread> {
  onPlayAnimation: () => void;
  onEditAnimation: () => void;
}
