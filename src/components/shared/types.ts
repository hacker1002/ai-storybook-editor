// types.ts - Shared type definitions used across canvas and playable spread views

// === Geometry Types ===
export interface Point {
  x: number;
  y: number;
}

export interface Geometry {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  w: number; // percentage 0-100
  h: number; // percentage 0-100
}

// === Typography ===
export interface Typography {
  size?: number;
  weight?: number;
  style?: "normal" | "italic";
  family?: string;
  color?: string;
  lineHeight?: number;
  letterSpacing?: number;
  decoration?: "none" | "underline" | "line-through";
  textAlign?: "left" | "center" | "right";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
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
  type: "solid" | "dashed" | "dotted";
}

// === Shape Fill & Outline (different from textbox Fill/Outline) ===
export interface ShapeFill {
  is_filled: boolean;
  color: string;
  opacity: number;
}

export interface ShapeOutline {
  color: string;
  width: number;
  radius: number;
  type: 0 | 1 | 2; // 0=solid, 1=dashed, 2=dotted
}

// === Spread Shape ===
export interface SpreadShape {
  id: string;
  type: "rectangle";
  title?: string;
  geometry: Geometry;
  fill: ShapeFill;
  outline: ShapeOutline;
  // Retouch only
  player_visible?: boolean;
  editor_visible?: boolean;
}

// === Spread Video ===
export type SpreadItemMediaType =
  | "raw"
  | "character"
  | "prop"
  | "background"
  | "foreground"
  | "other";

export interface SpreadVideo {
  id: string;
  title?: string;
  geometry: Geometry;
  "z-index": number;
  player_visible: boolean;
  editor_visible: boolean;
  original_image_id?: string;
  name: string;
  state?: string;
  type: SpreadItemMediaType;
  media_url?: string;
}

// === Spread Audio ===
export interface SpreadAudio {
  id: string;
  title?: string;
  geometry: Geometry;
  "z-index": number;
  player_visible: boolean;
  editor_visible: boolean;
  name: string;
  state?: string;
  type: SpreadItemMediaType;
  media_url?: string;
}

// === Page Types ===
export interface PageData {
  number: string | number;
  type: "normal_page" | "front_matter" | "back_matter" | "dedication";
  layout: string | null;
  background: {
    color: string;
    texture: string | null;
  };
}

// === Spread Item Types ===
export interface SpreadImage {
  id: string;
  title?: string;
  geometry: Geometry;
  setting?: string;
  art_note?: string;
  visual_description?: string;
  image_references?: Array<{ title: string; media_url: string }>;

  // Sketch images (step 2) - direct URL, no illustration variants
  media_url?: string;

  // Illustration images (step 3) - multiple variants, one selected
  illustrations?: Array<{
    media_url: string;
    created_time: string;
    is_selected: boolean;
  }>;
  final_hires_media_url?: string;

  // Retouch-specific optional fields
  "z-index"?: number;
  player_visible?: boolean;
  editor_visible?: boolean;
  aspect_ratio?: string;
  original_image_id?: string;
  name?: string;
  state?: string;
  type?: SpreadItemMediaType;
}

export interface SpreadTextbox {
  id: string;
  title?: string;
  [languageKey: string]: SpreadTextboxContent | string | undefined;
}

export interface SpreadTextboxContent {
  text: string;
  geometry: Geometry;
  typography: Typography;
  fill?: Fill;
  outline?: Outline;
}

export interface SpreadAnimation {
  order: number;
  type: 0 | 1; // 0=story timeline, 1=object interactive
  group?: string;
  target: {
    id: string;
    type: "textbox" | "image" | "video" | "audio" | "shape";
  };
  trigger_type:
    | "on_click_spread"
    | "on_click_object"
    | "with_previous"
    | "after_previous";
  effect: {
    type: number;
    geometry?: Geometry;
    delay?: number;
    duration?: number;
    loop?: number;
    amount?: number;
    direction?: "left" | "right" | "up" | "down";
  };
}

// === Base Spread Interface ===
export interface BaseSpread {
  id: string;
  pages: PageData[];
  images: SpreadImage[];
  textboxes: SpreadTextbox[];
  shapes?: SpreadShape[];
  videos?: SpreadVideo[];
  audios?: SpreadAudio[];
  animations?: SpreadAnimation[];
  manuscript?: string;
  tiny_sketch_media_url?: string;
}
