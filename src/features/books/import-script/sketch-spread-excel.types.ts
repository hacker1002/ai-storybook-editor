// sketch-spread-excel.types.ts — intermediate parse-model interfaces for the SHARED
// new-template sketch-spread parser (design 04-import-sketch-spreads.md §7 +
// 07-01-import-script-excel.md §6). Pure types — no logic. Consumed by both the
// book-creation import (07-01) and the editor `＋` sketch-spread import (04).

import type { Geometry } from '@/types/spread-types';
import type { TypographySettings } from '@/types/editor';
import type { SketchSpread } from '@/types/sketch';

/** Raw cell value as produced by `sheet_to_json(header:1)`. */
export type Cell = string | number | boolean | null | undefined;
/** A sheet as a row-major matrix (row 0 = lane-header / first row). */
export type SheetMatrix = Cell[][];

/** One Storyboard block: a `SPREAD N …` header + its labeled art_direction rows.
 *  `cell(label, col)` reads a labeled row at a page column (B=left, C=right). */
export interface ParsedSpreadBlock {
  n: number;                 // SPREAD number — join key with the language tabs
  header: string;            // 'SPREAD 4 — TRANG ĐÔI'
  isDPS: boolean;            // header contains DPS_MARKER
  cell: (label: string, col: number) => string | undefined;
}

/** One SPREAD block inside a single language tab (textbox source). */
export interface ParsedLangBlock {
  n: number;
  isDPS: boolean;
  loiVan: (string | undefined)[];   // [col] → narration text
  textbox: (string | undefined)[];  // [col] → 'x=% y=% w=% h=% font_size='
}

/** Parsed `Textbox` row → geometry (%) + optional font size. */
export interface ParsedTextboxGeo {
  box: Geometry;
  font_size?: number;
}

/** Collected validation results. `errors` block commit; `warnings` are advisory. */
export interface ImportIssues {
  errors: string[];
  warnings: string[];
}

/** Minimal book shape the parser needs (avoids importing the full Book type).
 *  `typography` is the book's PER-LANGUAGE map (keyed by language code), same as
 *  `Book.typography` — NOT a flat Typography. */
export interface SketchImportBook {
  original_language: string;
  typography?: Record<string, TypographySettings> | null;
}

/** Result contract shared by both callers (editor `＋` + book import). */
export interface ParseSketchSpreadsResult {
  spreads: SketchSpread[];
  issues: ImportIssues;
}

/** Workbook adapter — decouples the parser from SheetJS so the core unit-tests on
 *  plain matrices. Callers build this after the lazy `XLSX.read` (see both importers). */
export interface SketchImportWorkbook {
  SheetNames: string[];
  /** A sheet as a `header:1` matrix, or null when the sheet is absent. */
  sheetMatrix: (name: string) => SheetMatrix | null;
}
