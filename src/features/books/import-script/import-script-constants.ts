// import-script-constants.ts — Mapping constants for the Excel → sketch snapshot
// importer. Target is SKETCH (design 07-01). Storyboard/lang parsing constants live in
// the shared `sketch-spread-excel.constants.ts`; this file keeps only the entity-sheet
// names + the textbox bottom-band geometry defaults reused by the shared parser.

import type { Geometry } from '@/types/spread-types';

export const SHEET = {
  CHARACTERS: 'Characters',
  PROPS: 'Props',
  STAGES: 'Stages',
} as const;

// ── Default textbox geometry (percentage 0-100, spread-relative) ───────────────
// Fallback only — real narration geometry is per-language, read from each language
// tab's `Textbox` row. Reused by `sketch-spread-excel.constants.ts` (single source).
// Left/right sit in a bottom band; DPS spans wide. All editable post-import.

export const DEFAULT_DPS_TEXTBOX_GEO: Geometry = { x: 10, y: 78, w: 80, h: 18 };
export const DEFAULT_LEFT_TEXTBOX_GEO: Geometry = { x: 5, y: 78, w: 40, h: 18 };
export const DEFAULT_RIGHT_TEXTBOX_GEO: Geometry = { x: 55, y: 78, w: 40, h: 18 };
