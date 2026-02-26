// types.ts - Shared type definitions used across canvas and playable spread views

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

// === Spread Object ===
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
  aspect_ratio?: 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '2:3' | '3:2';
}
