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

// Per-language textbox content (the value stored under each language-code key).
export interface SketchTextboxContent {
  text: string;
  geometry: Geometry;
  typography: Typography;
}

// Per-language textbox content keyed by language code; `id` is the only literal string key.
// The union with `string` is what the `id` slot occupies — narrow with the guards below
// before treating an indexed value as content (validation decision: cast-in-place, no refactor).
export interface SketchTextbox {
  id: string;
  [languageKey: string]: SketchTextboxContent | string;
}

// Guard: an indexed SketchTextbox value is language content (object) vs the literal `id` (string).
export function isSketchTextboxContent(
  value: SketchTextboxContent | string | undefined,
): value is SketchTextboxContent {
  return typeof value === 'object' && value !== null;
}

// Accessor: the content entry for a language, or undefined (absent / the `id` slot).
export function getSketchTextboxContent(
  textbox: SketchTextbox,
  languageKey: string,
): SketchTextboxContent | undefined {
  const value = textbox[languageKey];
  return isSketchTextboxContent(value) ? value : undefined;
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
