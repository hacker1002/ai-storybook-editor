// Sketch snapshot types — new pipeline-step-1 data model (design commit 3847f27,
// snapshot/structure.md#sketch-structure). Restructures the legacy
// dummy/character_sheets/prop_sheets shape into { characters, props, stages, spreads }.
//
// SCOPE: types + an empty-default field + load-time guard only (no CRUD this phase).
// Creative spaces are still "coming soon"; full slice + UI deferred.
import type { Geometry, Typography } from './spread-types';

export type SketchEntityKind = 'characters' | 'props' | 'stages';
export type SketchPageType = 'left' | 'right' | 'full';

export interface SketchVariant {
  key: string;
  visual_description: string;
}

export interface SketchEntity {
  key: string;
  media_url: string | null;
  variants: SketchVariant[];
}

export interface ArtDirection {
  stage: string;
  setting: string;
  light_color: string;
  composition: string;
  action: string;
  camera: string;
  art_concept: string;
  negative_space: string;
  layers: string;
  interactive_intent: string;
  animation: string;
  sound: string;
  space_time: string;
}

export interface SketchPage {
  type: SketchPageType;
  art_direction: ArtDirection;
}

// Per-language textbox content keyed by language code; `id` is the only literal key.
export interface SketchTextbox {
  id: string;
  [languageKey: string]: { text: string; geometry: Geometry; typography: Typography } | string;
}

export interface SketchSpread {
  id: string;
  media_url: string | null;
  pages: SketchPage[];
  textboxes: SketchTextbox[];
}

export interface Sketch {
  id: string | null;
  characters: SketchEntity[];
  props: SketchEntity[];
  stages: SketchEntity[];
  spreads: SketchSpread[];
}
