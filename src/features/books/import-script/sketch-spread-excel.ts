// sketch-spread-excel.ts — SHARED new-template Excel → SketchSpread[] transform.
// Single source of truth for BOTH the book-creation import (07-01) and the editor
// `＋` sketch-spread import (04). PURE: operates on already-extracted sheet matrices
// (via the SketchImportWorkbook adapter) so it unit-tests without SheetJS; no store /
// toast / network side-effects.
//
// New template (design 04 §2): Storyboard = 9 labeled rows → 7 art_direction fields
// (direct 1-1 map, `action` = Diễn biến + Character); narration lives in per-language
// tabs (`vi_VN`, `en_US`, …) → multilang `textboxes[].[language_key]` with per-language
// geometry/typography. Only the main lane (columns B/C) is read; branch D/E is dropped.

import type {
  ArtDirection,
  SketchPage,
  SketchPageType,
  SketchSpread,
  SketchTextbox,
  SketchTextboxContent,
} from '@/types/sketch';
import type { Geometry, Typography } from '@/types/spread-types';
import { mapTypographyToTextbox } from '@/constants/book-defaults';
import { newUuid } from '@/utils/uuid';
import { createLogger } from '@/utils/logger';
import {
  AD_KEYS,
  AD_ROW,
  DEFAULT_DPS_TEXTBOX_GEO,
  DEFAULT_LEFT_TEXTBOX_GEO,
  DEFAULT_RIGHT_TEXTBOX_GEO,
  DEFAULT_TEXTBOX_TYPOGRAPHY,
  DIEN_BIEN,
  DPS_MARKER,
  GEO_TOKEN_RE,
  KNOWN_STORYBOARD_LABELS,
  LANG_SHEET_RE,
  LOI_VAN_PREFIX,
  MAIN_LANE,
  SPREAD_HEADER_RE,
  STORYBOARD_SHEET,
  TEXTBOX_ROW,
} from './sketch-spread-excel.constants';
import type {
  Cell,
  ImportIssues,
  ParsedLangBlock,
  ParsedSpreadBlock,
  ParsedTextboxGeo,
  ParseSketchSpreadsResult,
  SheetMatrix,
  SketchImportBook,
  SketchImportWorkbook,
} from './sketch-spread-excel.types';

const log = createLogger('Books', 'SketchSpreadExcel');

/** One page-side to build: its SketchPage type + the Storyboard/lang column to read. */
interface PageSide {
  type: SketchPageType;
  col: number;
}

// ── Cell helpers ────────────────────────────────────────────────────────────

/** Coerce a raw cell to a trimmed string ('' when blank). */
function cellStr(v: Cell): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** '' → undefined so downstream never builds empty layers. */
function orUndef(s: string): string | undefined {
  return s.length > 0 ? s : undefined;
}

/** '' → undefined; trims outer whitespace but keeps interior newlines (narration `\n`). */
function textOrUndef(v: Cell): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).replace(/\r\n/g, '\n').trim();
  return s.length > 0 ? s : undefined;
}

function emptyArtDirection(): ArtDirection {
  const ad = {} as ArtDirection;
  for (const key of AD_KEYS) ad[key] = '';
  return ad;
}

/** Join non-empty trimmed parts with a newline (Diễn biến + Character → action). */
function joinNonEmpty(...parts: (string | undefined)[]): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join('\n');
}

// ── Storyboard splitter ───────────────────────────────────────────────────────

/**
 * Scan the Storyboard matrix block-by-block → one ParsedSpreadBlock per `SPREAD N …`
 * header. Rows are stored by their col-A label; `cell(label, col)` reads them back.
 * Warns on: unknown labels (ignored), and a DPS block that carries RIGHT-column content.
 */
export function splitSpreadBlocks(matrix: SheetMatrix, warnings: string[]): ParsedSpreadBlock[] {
  const blocks: ParsedSpreadBlock[] = [];
  let rows: Map<string, Cell[]> | null = null;

  const finalize = (n: number, header: string, isDPS: boolean, blockRows: Map<string, Cell[]>) => {
    const cell = (label: string, col: number): string | undefined =>
      orUndef(cellStr(blockRows.get(label)?.[col]));

    // Unknown labels → warn once, keep ignoring.
    for (const label of blockRows.keys()) {
      if (!KNOWN_STORYBOARD_LABELS.has(label)) {
        warnings.push(`SPREAD ${n}: nhãn dòng lạ "${label}" — bỏ qua`);
      }
    }
    // DPS but the RIGHT (PHẢI) column has content → prefer LEFT, warn.
    if (isDPS) {
      const rightHasData = [...KNOWN_STORYBOARD_LABELS].some(
        (label) => cell(label, MAIN_LANE.right) !== undefined,
      );
      if (rightHasData) {
        warnings.push(`SPREAD ${n}: trang đôi (TRANG ĐÔI) nhưng cột PHẢI có nội dung — ưu tiên cột TRÁI`);
      }
    }
    blocks.push({ n, header, isDPS, cell });
  };

  let openN = 0;
  let openHeader = '';
  let openIsDPS = false;

  for (const row of matrix) {
    const label = cellStr(row[0]);
    const m = SPREAD_HEADER_RE.exec(label);
    if (m) {
      if (rows) finalize(openN, openHeader, openIsDPS, rows);
      openN = Number(m[1]);
      openHeader = row.map(cellStr).filter(Boolean).join(' ');
      openIsDPS = openHeader.toUpperCase().includes(DPS_MARKER.toUpperCase());
      rows = new Map();
      continue;
    }
    if (!rows || !label) continue;
    rows.set(label, row);
  }
  if (rows) finalize(openN, openHeader, openIsDPS, rows);

  log.info('splitSpreadBlocks', 'done', { blockCount: blocks.length, warningCount: warnings.length });
  return blocks;
}

// ── Language-tab splitter ──────────────────────────────────────────────────────

/** Scan one language tab → { N → ParsedLangBlock }. Narration label matched by PREFIX. */
export function splitLangBlocks(matrix: SheetMatrix): Record<number, ParsedLangBlock> {
  const out: Record<number, ParsedLangBlock> = {};
  let current: ParsedLangBlock | null = null;

  for (const row of matrix) {
    const label = cellStr(row[0]);
    const m = SPREAD_HEADER_RE.exec(label);
    if (m) {
      const n = Number(m[1]);
      const isDPS = row.map(cellStr).join(' ').toUpperCase().includes(DPS_MARKER.toUpperCase());
      current = { n, isDPS, loiVan: [], textbox: [] };
      out[n] = current;
      continue;
    }
    if (!current || !label) continue;
    if (label.startsWith(LOI_VAN_PREFIX)) {
      current.loiVan = row.map((c) => textOrUndef(c));
    } else if (label === TEXTBOX_ROW) {
      current.textbox = row.map((c) => orUndef(cellStr(c)));
    }
  }
  return out;
}

/** Parse a `Textbox` cell → { box, font_size } | null (missing x/y/w/h → null). */
export function parseGeo(cell: string | undefined): ParsedTextboxGeo | null {
  if (!cell) return null;
  const nums: Partial<Record<'x' | 'y' | 'w' | 'h' | 'font_size', number>> = {};
  for (const m of cell.matchAll(GEO_TOKEN_RE)) {
    nums[m[1] as keyof typeof nums] = Number(m[2]);
  }
  if (nums.x == null || nums.y == null || nums.w == null || nums.h == null) return null;
  const box: Geometry = { x: nums.x, y: nums.y, w: nums.w, h: nums.h };
  return nums.font_size != null ? { box, font_size: nums.font_size } : { box };
}

// ── Builders ────────────────────────────────────────────────────────────────

/** Build one page's 7-field art_direction (direct 1-1 map + action merge). */
export function buildPage(type: SketchPageType, block: ParsedSpreadBlock, col: number): SketchPage {
  const ad = emptyArtDirection();
  for (const [label, field] of Object.entries(AD_ROW)) {
    ad[field] = block.cell(label, col) ?? '';
  }
  // action = Diễn biến + Character (AD_ROW already set action = Character cell).
  ad.action = joinNonEmpty(block.cell(DIEN_BIEN, col), ad.action);
  return { type, art_direction: ad };
}

function defaultTextboxGeo(type: SketchPageType): Geometry {
  if (type === 'full') return { ...DEFAULT_DPS_TEXTBOX_GEO };
  if (type === 'right') return { ...DEFAULT_RIGHT_TEXTBOX_GEO };
  return { ...DEFAULT_LEFT_TEXTBOX_GEO };
}

/** Base typography for a language: book.typography.sketch[lang] (mapped) else default. */
function baseTypography(book: SketchImportBook, lang: string): Typography {
  const perLang = book.typography?.sketch?.[lang];
  return perLang ? mapTypographyToTextbox(perLang) : { ...DEFAULT_TEXTBOX_TYPOGRAPHY };
}

/**
 * Build the textboxes for a spread's page-sides, merging every language tab into one
 * textbox per side (`{ id, [lang]: content }`). A language is included only when it has
 * narration text for that side (no empty placeholders). Geometry/typography are
 * per-language (from each tab); missing/unparseable geometry falls back to the per-side
 * default (+ warn). Asymmetry vs the book's original language is warned.
 */
export function buildTextboxes(
  n: number,
  sides: PageSide[],
  langNames: string[],
  langBlocks: Record<string, Record<number, ParsedLangBlock>>,
  book: SketchImportBook,
  warnings: string[],
): SketchTextbox[] {
  const boxes: SketchTextbox[] = [];

  for (const side of sides) {
    const entry: Record<string, SketchTextboxContent> = {};
    for (const lang of langNames) {
      const lb = langBlocks[lang]?.[n];
      const text = lb?.loiVan[side.col];
      if (!text) continue;

      const geo = parseGeo(lb?.textbox[side.col]);
      if (!geo) {
        warnings.push(`SPREAD ${n} (${lang}, ${side.type}): thiếu/không đọc được dòng Textbox — dùng geometry mặc định`);
      }
      const base = baseTypography(book, lang);
      const typography: Typography =
        geo?.font_size != null ? { ...base, size: geo.font_size } : { ...base };
      entry[lang] = {
        text,
        geometry: geo?.box ?? defaultTextboxGeo(side.type),
        typography,
      };
    }

    const langsWithText = Object.keys(entry);
    if (langsWithText.length === 0) continue; // no narration for this side → no textbox

    // Asymmetry: some language(s) have text but the book's original language does not.
    if (langNames.includes(book.original_language) && !entry[book.original_language]) {
      warnings.push(`SPREAD ${n} (${side.type}): thiếu bản ngôn ngữ gốc "${book.original_language}" (bất đối xứng)`);
    }

    boxes.push({ id: newUuid(), ...entry } as SketchTextbox);
  }

  return boxes;
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Read a workbook adapter → { spreads, issues }. Storyboard drives structure +
 * art_direction (main lane B/C only); language tabs supply multilang textboxes joined
 * by SPREAD N. `images` is always [] (generate later). A missing/empty Storyboard sheet
 * is a blocking error, not a throw.
 */
export function buildSketchSpreadsFromWorkbook(
  wb: SketchImportWorkbook,
  book: SketchImportBook,
): ParseSketchSpreadsResult {
  const issues: ImportIssues = { errors: [], warnings: [] };
  log.info('buildSketchSpreadsFromWorkbook', 'start', {
    sheetCount: wb.SheetNames.length,
    lang: book.original_language,
  });

  const storyboard = wb.sheetMatrix(STORYBOARD_SHEET);
  if (!storyboard || storyboard.length === 0) {
    issues.errors.push(`Sheet "${STORYBOARD_SHEET}" không tồn tại hoặc rỗng.`);
    return { spreads: [], issues };
  }

  const blocks = splitSpreadBlocks(storyboard, issues.warnings);
  if (blocks.length === 0) {
    issues.errors.push(`Không tìm thấy block SPREAD nào trong "${STORYBOARD_SHEET}".`);
    return { spreads: [], issues };
  }

  const langNames = wb.SheetNames.filter((name) => LANG_SHEET_RE.test(name));
  if (langNames.length === 0) {
    issues.warnings.push('Không tìm thấy tab ngôn ngữ nào — textbox sẽ trống.');
  } else if (!langNames.includes(book.original_language)) {
    issues.warnings.push(`Thiếu tab ngôn ngữ gốc "${book.original_language}".`);
  }

  const langBlocks: Record<string, Record<number, ParsedLangBlock>> = {};
  for (const lang of langNames) {
    const m = wb.sheetMatrix(lang);
    langBlocks[lang] = m ? splitLangBlocks(m) : {};
  }

  // Spec 04 §6 / 07-01 §9: warn when a spread N in Storyboard has no block in a language
  // tab (textbox will be empty for it), or a lang tab carries an N not in Storyboard.
  const storyboardNs = new Set(blocks.map((b) => b.n));
  for (const lang of langNames) {
    const langNs = new Set(Object.keys(langBlocks[lang]).map(Number));
    const missing = [...storyboardNs].filter((n) => !langNs.has(n));
    if (missing.length) {
      issues.warnings.push(`Tab "${lang}" thiếu SPREAD ${missing.join(', ')} (textbox trống cho các spread đó)`);
    }
    const extra = [...langNs].filter((n) => !storyboardNs.has(n));
    if (extra.length) {
      issues.warnings.push(`Tab "${lang}" có SPREAD ${extra.join(', ')} không khớp Storyboard`);
    }
  }

  const spreads: SketchSpread[] = blocks.map((block) => {
    const sides: PageSide[] = block.isDPS
      ? [{ type: 'full', col: MAIN_LANE.left }]
      : [
          { type: 'left', col: MAIN_LANE.left },
          { type: 'right', col: MAIN_LANE.right },
        ];
    const pages = sides.map((s) => buildPage(s.type, block, s.col));
    const textboxes = buildTextboxes(block.n, sides, langNames, langBlocks, book, issues.warnings);
    return { id: newUuid(), images: [], pages, textboxes };
  });

  log.info('buildSketchSpreadsFromWorkbook', 'done', {
    spreadCount: spreads.length,
    langCount: langNames.length,
    warningCount: issues.warnings.length,
  });
  return { spreads, issues };
}
