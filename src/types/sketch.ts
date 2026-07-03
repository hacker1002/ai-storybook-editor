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

// Versioned PER-PAGE sketch image (mirrors the illustration `illustrations[]` model).
// A spread holds 1..2 images — one per page, keyed by the unique `type`: either a single
// 'full' backdrop, or a 'left' + 'right' pair. Each image accumulates generate versions,
// newest prepended, exactly one `is_selected`. Empty (`images: []`) until first generate.
export interface SketchSpreadIllustration {
  media_url: string;
  created_time: string; // ISO-8601
  is_selected: boolean;
}

export interface SketchSpreadImage {
  id: string; // UUID — stable key for ID-based reads
  type: SketchPageType; // page this image backs; UNIQUE within images[] (identity key)
  illustrations: SketchSpreadIllustration[]; // prepend-versioned; non-empty → exactly one is_selected
}

export interface SketchSpread {
  id: string;
  images: SketchSpreadImage[]; // 1..2 per-page images keyed by `type`; [] until generated
  pages: SketchPage[];
  textboxes: SketchTextbox[];
}

/**
 * Synthesized per-page placement (canvas %). Page images carry no stored geometry — the
 * dedicated SketchSpreadCanvas derives each one from its `type`: 'full' spans the sheet;
 * 'left'/'right' split at the 50% spine. Exported here (single source) so the slice and the
 * canvas stay DRY.
 */
export const SKETCH_PAGE_GEOMETRY: Record<SketchPageType, Geometry> = {
  full: { x: 0, y: 0, w: 100, h: 100 },
  left: { x: 0, y: 0, w: 50, h: 100 },
  right: { x: 50, y: 0, w: 50, h: 100 },
};

/**
 * Effective url for a SINGLE page of a spread, resolved by page `type`
 * (selected version → newest → null). null when that page has no image yet.
 * Used by the dedicated SketchSpreadCanvas to place each per-page backdrop.
 */
export function getSketchSpreadPageImageUrl(
  spread: SketchSpread,
  pageType: SketchPageType,
): string | null {
  const illustrations = spread.images.find((im) => im.type === pageType)?.illustrations ?? [];
  return illustrations.find((i) => i.is_selected)?.media_url ?? illustrations[0]?.media_url ?? null;
}

/**
 * Thumbnail URL for a sketch spread: the effective url of the FIRST page image (doc order),
 * else null. Used by the sidebar thumbnail (one representative page per spread).
 */
export function getSketchSpreadEffectiveUrl(spread: SketchSpread): string | null {
  const illustrations = spread.images[0]?.illustrations ?? [];
  return illustrations.find((i) => i.is_selected)?.media_url ?? illustrations[0]?.media_url ?? null;
}

export interface Sketch {
  id: string | null;
  characters: SketchEntity[];
  props: SketchEntity[];
  stages: SketchEntity[];
  spreads: SketchSpread[];
}
