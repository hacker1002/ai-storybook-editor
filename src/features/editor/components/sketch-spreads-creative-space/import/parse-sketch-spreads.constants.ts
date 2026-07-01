// parse-sketch-spreads.constants.ts — mapping constants for Storyboard → SketchSpread[]
// (design 04-import-sketch-spreads.md §2). Block-splitter constants (SPREAD_HEADER_RE,
// LANE_COLUMNS, DPS_MARKER, ROW_LABEL) are NOT redefined here — they live in and are reused
// via `books/import-script` through the shared `parseStoryboard` (single source of truth).

import type { ArtDirection } from '@/types/sketch';

/** Storyboard sheet name (design §4). */
export const STORYBOARD_SHEET = 'Storyboard';

// Labeled sub-fields inside the "Chỉ đạo hình ảnh" cell → ArtDirection keys (design §2.1).
// NOTE: 'Không gian–thời gian' uses an EN DASH (U+2013), not a hyphen — match exactly.
export const AD_SUBFIELD: Record<string, keyof ArtDirection> = {
  'Góc máy': 'camera',
  'Bố cục': 'composition',
  'Nhân vật': 'action', // merged with the 'Diễn biến' row
  'Bối cảnh': 'setting',
  'Không gian–thời gian': 'space_time',
  'Ánh sáng & màu': 'light_color',
  'Ý tưởng nghệ thuật': 'art_concept',
  Interactive: 'interactive_intent',
};

// §2.2 — derived fields inside the Interactive block (fail-safe: no match → '').
export const SOUND_LABELS = ['Ambient', 'Âm thanh'] as const;
export const LAYER_LABELS = ['Tách layer', 'Layer'] as const;

// Excel carries no textbox typography → default fallback (design §3 example JSON).
// Textbox GEOMETRY is NOT redefined here: it reuses the book importer's bottom-band
// per-side constants (DEFAULT_LEFT/RIGHT/DPS_TEXTBOX_GEO) — single source of truth, so
// sketch import and full-book import place narration identically (design §3/§4.2).
export const DEFAULT_TEXTBOX_TYPOGRAPHY = { size: 16, color: '#000000' } as const;

/** The 13 ArtDirection keys (used to seed an empty art_direction). */
export const AD_KEYS: (keyof ArtDirection)[] = [
  'stage', 'setting', 'light_color', 'composition', 'action', 'camera', 'art_concept',
  'negative_space', 'layers', 'interactive_intent', 'animation', 'sound', 'space_time',
];
