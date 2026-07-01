// parse-sketch-spreads.ts — PURE Storyboard → SketchSpread[] transform (no UI/store/toast).
// Reuses the book importer's block-splitter (`parseStoryboard`) for the shared SPREAD/lane/DPS
// scanning, then maps each ParsedSpreadCell → a thin SketchSpread (media_url:null +
// 13-field art_direction + one narration textbox). Net-new logic here: the labeled
// "Chỉ đạo hình ảnh" sub-field parser (design §2.1) + Interactive derive (§2.2) + the mapper.

import type {
  SketchSpread,
  ArtDirection,
  SketchTextbox,
} from '@/types/sketch';
import type { Geometry, Typography } from '@/types/spread-types';
import type { TypographySettings } from '@/types/editor';
import { parseStoryboard, type SheetMatrix } from '@/features/books/import-script/parse-excel-workbook';
import type { ParsedPageCell, ParsedSpreadCell } from '@/features/books/import-script/import-script-types';
// Reuse the full-book importer's bottom-band textbox geometry (single source of truth) so
// sketch import places narration identically: left/right at the page foot, DPS spanning wide.
import {
  DEFAULT_LEFT_TEXTBOX_GEO,
  DEFAULT_RIGHT_TEXTBOX_GEO,
  DEFAULT_DPS_TEXTBOX_GEO,
} from '@/features/books/import-script/import-script-constants';
import { mapTypographyToTextbox } from '@/constants/book-defaults';
import { newUuid } from '@/utils/uuid';
import { createLogger } from '@/utils/logger';
import {
  STORYBOARD_SHEET,
  AD_SUBFIELD,
  SOUND_LABELS,
  LAYER_LABELS,
  DEFAULT_TEXTBOX_TYPOGRAPHY,
  AD_KEYS,
} from './parse-sketch-spreads.constants';

const log = createLogger('Editor', 'ParseSketchSpreads');

export interface ImportIssues {
  errors: string[];
  warnings: string[];
}

export interface ParseSketchSpreadsResult {
  spreads: SketchSpread[];
  issues: ImportIssues;
}

/** Minimal book shape the parser needs (avoids importing the full Book type).
 *  `typography` is the book's PER-LANGUAGE map (keyed by language code), same as
 *  `Book.typography` — NOT a flat Typography. */
export interface SketchImportBook {
  original_language: string;
  typography?: Record<string, TypographySettings> | null;
}

// All labels that begin a new segment in the Chỉ đạo cell (AD sub-fields + derive labels).
const KNOWN_CHI_DAO_LABELS: string[] = [
  ...Object.keys(AD_SUBFIELD),
  ...SOUND_LABELS,
  ...LAYER_LABELS,
];

function emptyArtDirection(): ArtDirection {
  const ad = {} as ArtDirection;
  for (const key of AD_KEYS) ad[key] = '';
  return ad;
}

function joinNonEmpty(parts: (string | undefined)[]): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

interface ParsedChiDao {
  fields: Map<string, string>;
  freeText: string;
}

/**
 * Parse the multi-line "Chỉ đạo hình ảnh" cell into labeled segments. A line begins a new
 * field ONLY when the text before its first ':' is a known label (so colons inside content
 * don't mis-split). Any text before the first known label becomes free-text (→ art_concept).
 * Fail-safe: unknown "Label:" lines are treated as continuation, never dropped.
 */
export function parseChiDao(cell: string): ParsedChiDao {
  const fields = new Map<string, string>();
  const freeLines: string[] = [];
  let currentLabel: string | null = null;

  for (const rawLine of cell.split(/\r?\n/)) {
    const colon = rawLine.indexOf(':');
    const maybeLabel = colon >= 0 ? rawLine.slice(0, colon).trim() : '';
    if (colon >= 0 && KNOWN_CHI_DAO_LABELS.includes(maybeLabel)) {
      currentLabel = maybeLabel;
      const value = rawLine.slice(colon + 1).trim();
      const prev = fields.get(currentLabel);
      fields.set(currentLabel, prev ? `${prev}\n${value}` : value);
    } else if (currentLabel) {
      fields.set(currentLabel, `${fields.get(currentLabel) ?? ''}\n${rawLine}`);
    } else if (rawLine.trim()) {
      freeLines.push(rawLine.trim());
    }
  }

  for (const [key, value] of fields) fields.set(key, value.trim());
  return { fields, freeText: freeLines.join('\n').trim() };
}

/** Build one page's 13-field art_direction from its parsed content cells. */
export function buildArtDirection(page: ParsedPageCell): ArtDirection {
  const ad = emptyArtDirection();
  ad.stage = (page.stage_ref ?? '').trim();

  const { fields, freeText } = parseChiDao(page.chi_dao_hinh_anh ?? '');

  // action = Diễn biến row + 'Nhân vật' sub-field (design §2.1).
  ad.action = joinNonEmpty([page.dien_bien, fields.get('Nhân vật')]);

  // Remaining labeled sub-fields → their keys.
  for (const [label, key] of Object.entries(AD_SUBFIELD)) {
    if (key === 'action') continue;
    const value = fields.get(label);
    if (value) ad[key] = value;
  }

  // §2.2 — derive sound/layers from the Interactive block (fail-safe → '').
  ad.sound = SOUND_LABELS.map((label) => fields.get(label)).find(Boolean) ?? '';
  ad.layers = LAYER_LABELS.map((label) => fields.get(label)).find(Boolean) ?? '';

  // Free-text (no label) → art_concept, so nothing is lost.
  if (freeText) ad.art_concept = joinNonEmpty([ad.art_concept, freeText]);

  return ad;
}

/**
 * Build one narration textbox from a page's Lời văn cell (null when empty). `geometry` is the
 * bottom-band slot for that page side (left / right / DPS) — each page carries its own textbox
 * so a 2-page spread yields 2 textboxes, not 1.
 */
export function buildTextbox(
  loiVan: string | undefined,
  book: SketchImportBook,
  geometry: Geometry,
): SketchTextbox | null {
  const text = (loiVan ?? '').replace(/\r\n/g, '\n');
  if (!text.trim()) return null;
  // Inherit the book's narration typography for the original language; fall back to the default.
  const perLang = book.typography?.[book.original_language];
  const typography: Typography = perLang
    ? mapTypographyToTextbox(perLang)
    : { ...DEFAULT_TEXTBOX_TYPOGRAPHY };
  return {
    id: newUuid(),
    [book.original_language]: { text, geometry: { ...geometry }, typography },
  } as SketchTextbox;
}

/**
 * Map one ParsedSpreadCell (spread × lane) → a thin SketchSpread (media_url:null).
 * Narration is PER PAGE (design §4, mirroring the full-book importer): a DPS spread gets one
 * wide bottom textbox; a 2-page spread gets a left AND a right bottom textbox (each skipped when
 * its Lời văn is empty). Image stays single (media_url:null) — left+right share one backdrop.
 */
export function buildSketchSpread(cell: ParsedSpreadCell, book: SketchImportBook): SketchSpread {
  const left = cell.pages[0];
  if (cell.is_dps) {
    const textbox = buildTextbox(left?.loi_van, book, DEFAULT_DPS_TEXTBOX_GEO);
    return {
      id: newUuid(),
      media_url: null,
      pages: [{ type: 'full', art_direction: buildArtDirection(left) }],
      textboxes: textbox ? [textbox] : [],
    };
  }

  const right = cell.pages[1];
  const textboxes = [
    buildTextbox(left?.loi_van, book, DEFAULT_LEFT_TEXTBOX_GEO),
    buildTextbox(right?.loi_van, book, DEFAULT_RIGHT_TEXTBOX_GEO),
  ].filter((tb): tb is SketchTextbox => tb !== null);
  return {
    id: newUuid(),
    media_url: null,
    pages: [
      { type: 'left', art_direction: buildArtDirection(left) },
      { type: 'right', art_direction: buildArtDirection(right ?? left) },
    ],
    textboxes,
  };
}

/**
 * Read a `.xlsx` File → { spreads, issues } (PURE of side-effects: no confirm/toast/store —
 * that is the component's job). Lazy-imports xlsx. A missing/empty sheet is a blocking error,
 * not a throw.
 */
export async function parseSketchSpreadsFromFile(
  file: File,
  book: SketchImportBook,
): Promise<ParseSketchSpreadsResult> {
  const warnings: string[] = [];
  log.info('parseSketchSpreadsFromFile', 'start', { fileName: file.name, size: file.size });

  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  let wb: ReturnType<typeof XLSX.read>;
  try {
    wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  } catch (err) {
    log.error('parseSketchSpreadsFromFile', 'read failed', { error: String(err) });
    return { spreads: [], issues: { errors: ['Could not read the Excel file.'], warnings } };
  }

  const ws = wb.Sheets[STORYBOARD_SHEET];
  if (!ws) {
    log.warn('parseSketchSpreadsFromFile', 'sheet not found', { sheets: wb.SheetNames });
    return { spreads: [], issues: { errors: [`Sheet "${STORYBOARD_SHEET}" not found.`], warnings } };
  }

  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false }) as SheetMatrix;
  const cells = parseStoryboard(matrix, warnings); // reuse book importer's block-splitter
  if (cells.length === 0) {
    return {
      spreads: [],
      issues: { errors: [`No SPREAD blocks found in "${STORYBOARD_SHEET}".`], warnings },
    };
  }

  const spreads = cells.map((cell) => buildSketchSpread(cell, book));
  log.info('parseSketchSpreadsFromFile', 'done', {
    spreadCount: spreads.length,
    warningCount: warnings.length,
  });
  return { spreads, issues: { errors: [], warnings } };
}
