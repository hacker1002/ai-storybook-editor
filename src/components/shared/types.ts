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

// === Spread Object ===
export interface SpreadObject {
  id: string;
  original_image_id?: string;
  name: string;
  state?: string;
  type: "raw" | "character" | "prop" | "background" | "foreground" | "other";
  media_url?: string;
  media_type?: "image" | "video" | "audio";
  geometry: Geometry;
  zIndex: number;
  player_visible: boolean;
  editor_visible: boolean;
  aspect_ratio?:
    | "free"
    | "1:1"
    | "4:3"
    | "3:4"
    | "16:9"
    | "9:16"
    | "2:3"
    | "3:2";
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
  sketches?: Array<{
    media_url: string;
    created_time: string;
    is_selected: boolean;
  }>;
  illustrations?: Array<{
    media_url: string;
    created_time: string;
    is_selected: boolean;
  }>;
  final_hires_media_url?: string;
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
  type: "textbox" | "image" | "video" | "audio";
  target: { id: string; type: "textbox" | "object" };
  trigger_type: "on_click" | "with_previous" | "after_previous";
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
  objects?: SpreadObject[];
  animations?: SpreadAnimation[];
  manuscript?: string;
  tiny_sketch_media_url?: string;
}
