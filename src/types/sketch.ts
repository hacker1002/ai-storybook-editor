// Sketch snapshot types — new pipeline-step-1 data model (design commit 3847f27,
// snapshot/structure.md#sketch-structure). Restructures the legacy
// dummy/character_sheets/prop_sheets shape into { characters, props, stages, spreads }.
//
// SCOPE: types + an empty-default field + load-time guard only (no CRUD this phase).
// Creative spaces are still "coming soon"; full slice + UI deferred.
import type { Geometry, Typography } from './spread-types';
// Canonical illustration entry + style reference are REUSED from prop-types (single source);
// base sheets, crops and per-variant imagery all share the edit-image-modal Illustration shape.
import type { Illustration, ImageReference } from './prop-types';

export type SketchEntityKind = 'characters' | 'props' | 'stages';
/** Base sheet workspace covers character + prop only (stage generates directly, no base sheet). */
export type BaseKind = 'characters' | 'props';
export type SketchPageType = 'left' | 'right' | 'full';

// ── Variant crop (positional — NO key; 2026-07-14) ───────────────────────────
// One cell cut from the currently-selected raw sheet. Element order = read order of cells 1..4
// (template_cell_boxes(4)). At most 1 is_selected across the 4 (the locked cell = official image).
export interface SketchVariantCrop {
  is_selected: boolean;                          // cell locked as the variant's official image — ≤1/4 true (0 = none yet)
  illustrations: Illustration[];                 // this cell's edit versions, canonical, edit-able; non-empty → exactly 1 is_selected
}

// char/prop variant: 4 text field + optional raw_sheet imagery (raw sheet + positional crops[]).
// stage variant: no height/raw_sheet → `illustrations[]` generated directly.
export interface SketchVariant {
  key: string;                                   // variant key (base, hero); ref = @{entity.key}/{key}
  description: string;                           // ⚡ replaces the legacy visual_description (Excel "description")
  height?: number | null;                       // ⚡ cm (number, 2026-07-17) — char/prop only (Excel "height" parsed via parseHeightCm); stage has none
  visual_design: string;                        // Excel "visual_design"
  art_language: string;                         // Excel "art_language"
  // char/prop only — ⚡ 2026-07-14: the single `crop` field is GONE; crops[] now live INSIDE raw_sheet.
  raw_sheet?: {
    illustrations: Illustration[];               // raw 21:9 sheet versions (CUT SOURCE, not displayed). variant 'base': empty/absent (raw lives only in base workspace)
    crops: SketchVariantCrop[];                  // 4 positional cells cut from the selected sheet. variant 'base': 1 crop cloned from base.{kind}_sheet.styles[selected].crops[key], is_selected=true
  };
  // stage only:
  illustrations?: Illustration[];                // direct generate, no crop
}

// key matches the top-level snapshot entity key. (per-entity media_url REMOVED — imagery lives on base + per-variant)
export interface SketchEntity {
  key: string;
  variants: SketchVariant[];
}

/** Lightweight reference to a non-base variant (variantKey ≠ 'base'). Lets the variant creative
 *  space enumerate variants across a kind without holding whole entity refs (reused by phase-05). */
export interface VariantRef {
  kind: BaseKind;
  entityKey: string;
  variantKey: string;
}

/** Flat projection of ONE variant (base INCLUDED) for the Lineup space — the locked crop image +
 *  its real-world height, i.e. everything needed to place it on the shared ruler. Lives here (next
 *  to VariantRef) because BOTH the store selector (`useSketchLineupEntries`) and the space consume
 *  it — a feature-owned type would invert the store → feature dependency. */
export interface LineupEntry {
  kind: BaseKind;
  entityKey: string;
  variantKey: string; // 'base' INCLUDED (unlike VariantRef consumers)
  ref: string; // "@{entityKey}/{variantKey}" — unique id (key of checkedRefs)
  imageUrl: string | null; // effective locked crop; null = no crop locked yet
  heightCm: number | null; // variants[].height (cm); null = not set yet
}

// ── Base workspace (generate raw sheets in bulk + crop per entity) ────────────
export interface SketchBaseCrop {
  key: string;                                   // entity key — exactly 1 crop / base entity
  illustrations: Illustration[];                 // crop versions, canonical, edit-able
}

export interface SketchBaseStyle {
  style_prompt: string;                          // style description for this generate attempt
  is_selected: boolean;                          // locked style — across non-empty styles at most 1 true/sheet
  image_references: ImageReference[];            // style reference images
  illustrations: Illustration[];                 // RAW sheet versions (1 sheet = ALL base entities), canonical, edit-able
  crops: SketchBaseCrop[];                       // per-entity crops lifted out of the raw sheet
}

export interface SketchBaseSheet {
  styles: SketchBaseStyle[];                     // each element = one art-style attempt (parallel, pick one to lock)
}

export interface SketchBase {
  character_sheet: SketchBaseSheet;              // all base characters
  prop_sheet: SketchBaseSheet;                   // all base props — no stage_sheet
}

/** Projection of the 'base' variant text (EditBaseEntityModal + crop labels). */
export interface BaseEntityText {
  key: string;
  description: string;                           // import-only
  height: number | null;                        // ⚡ cm (number, 2026-07-17) — import-only (char/prop); null = chưa có / parse fail
  visual_design: string;                        // editable
  art_language: string;                         // editable
}

/** Sheet accessor for a base kind (single source — reused by slice + selectors). */
export function sheetOf(base: SketchBase, kind: BaseKind): SketchBaseSheet {
  return kind === 'characters' ? base.character_sheet : base.prop_sheet;
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
  base: SketchBase;                             // ⚡ NEW — base sheet workspace (char + prop)
  characters: SketchEntity[];
  props: SketchEntity[];
  stages: SketchEntity[];
  spreads: SketchSpread[];
}
