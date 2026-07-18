// parse-stages.ts — Excel → SketchStage[] for the stage space's ⬆ import (design 05).
// Reads ONE sheet (`Stages`); each row = one variant; rows grouped by the `stage` key column.
// Output stages carry EMPTY imagery (base.styles=[], variant illustrations/crops=[]) — the
// import REPLACES the whole stages[] (locked decision 2026-07-18: no merge-by-key; generated
// images are lost, the root's confirm dialog warns).
//
// PURE by design (mirror parse-base-entities.ts): this module reads + parses + validates only —
// it NEVER confirms, toasts, or writes the store. The root owns confirm + setSketchStages +
// the gateway collection-scope persist. `parseStagesWorkbook` operates on an ArrayBuffer so it
// unit-tests without File I/O (fixtures via resolveJsonModule — NO node builtins).

import { createLogger } from '@/utils/logger';
import type { SketchStage, SketchStageVariant } from '@/types/sketch';
import { COL, REF_IN_TEXT_RE, REF_RE, STAGE_IMPORT_SHEET } from './parse-stages.constants';

const log = createLogger('Editor', 'ParseStages');

export interface StageImportIssues {
  errors: string[]; // block commit
  warnings: string[]; // advisory
}

export interface StageImportParse {
  stages: SketchStage[];
  issues: StageImportIssues;
}

/** A header-keyed sheet row: keys lowercased+trimmed, values coerced to trimmed strings. */
export type StageSheetRow = Record<string, string>;

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Normalize a raw header-keyed row → lowercase+trim keys, trimmed string values. */
export function normalizeRow(raw: Record<string, unknown>): StageSheetRow {
  const out: StageSheetRow = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.trim().toLowerCase()] = cellStr(v);
  }
  return out;
}

/**
 * Group normalized rows by the `stage` key column → SketchStage[]. One row = one variant;
 * stage order = first-seen. Rows with an empty key are skipped. Empty text cell → '' (the
 * variant is kept). NO height (stage model has none — the column is validated separately).
 */
export function parseStages(rows: StageSheetRow[]): SketchStage[] {
  const byKey = new Map<string, SketchStage>();
  for (const row of rows) {
    const key = row[STAGE_IMPORT_SHEET.keyColumn] ?? '';
    if (!key) continue;
    let stage = byKey.get(key);
    if (!stage) {
      stage = { key, base: { styles: [] }, variants: [] };
      byKey.set(key, stage);
    }
    const variant: SketchStageVariant = {
      key: row[COL.VARIANT] ?? '',
      description: row[COL.DESCRIPTION] ?? '',
      visual_design: row[COL.VISUAL_DESIGN] ?? '',
      art_language: row[COL.ART_LANGUAGE] ?? '',
      illustrations: [],
      crops: [],
    };
    stage.variants.push(variant);
  }
  return [...byKey.values()];
}

function extractInlineRefs(text: string): Array<{ key: string; variant: string }> {
  const refs: Array<{ key: string; variant: string }> = [];
  for (const m of text.matchAll(REF_IN_TEXT_RE)) {
    if (m.groups) refs.push({ key: m.groups.key, variant: m.groups.variant });
  }
  return refs;
}

/**
 * Validate parsed stages against their rows (pure — mutates `issues`).
 *  - error: duplicate (stage, variant) pair (breaks @ref identity).
 *  - warn:  not exactly one `base` variant / stage (API 11 can't seed without it);
 *           `height` column present (skipped once — stage has no height);
 *           `ref` column ≠ own `@key/variant`;
 *           inline `@ref` unresolved within the imported stages (cross-entity kept verbatim).
 */
export function validateStageImport(
  stages: SketchStage[],
  rows: StageSheetRow[],
  issues: StageImportIssues,
): void {
  for (const stage of stages) {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const v of stage.variants) {
      if (seen.has(v.key)) dups.add(v.key);
      seen.add(v.key);
    }
    if (dups.size > 0) {
      issues.errors.push(`Stage "${stage.key}": variant key trùng: ${[...dups].join(', ')}`);
    }

    const baseCount = stage.variants.filter((v) => v.key === 'base').length;
    if (baseCount !== 1) {
      issues.warnings.push(`Stage "${stage.key}": cần đúng 1 variant "base" (thấy ${baseCount}).`);
    }

    // warn: inline @ref unresolved within the imported stages (prop/char mentions kept verbatim —
    // server-side 12 resolves prop refs and skips character refs; only self-stage refs are checkable here).
    const stageKeys = new Set(stages.map((s) => s.key.toLowerCase()));
    for (const v of stage.variants) {
      for (const field of [v.description, v.visual_design, v.art_language]) {
        for (const ref of extractInlineRefs(field)) {
          const target = stages.find((s) => s.key.toLowerCase() === ref.key.toLowerCase());
          if (!stageKeys.has(ref.key.toLowerCase())) continue; // cross-entity (prop/char) — verbatim, not ours to judge
          if (target && !target.variants.some((tv) => tv.key.toLowerCase() === ref.variant.toLowerCase())) {
            issues.warnings.push(
              `Stage "${stage.key}" variant "${v.key}": @${ref.key}/${ref.variant} — "${ref.key}" không có variant "${ref.variant}".`,
            );
          }
        }
      }
    }
  }

  // warn (once): a height column exists — stages have no height, the column is skipped.
  if (rows.some((row) => (row[COL.HEIGHT] ?? '') !== '')) {
    issues.warnings.push('Cột "height" bị bỏ qua — stage không có height.');
  }

  for (const row of rows) {
    const rowKey = row[STAGE_IMPORT_SHEET.keyColumn] ?? '';
    if (!rowKey) continue;
    const refCell = row[COL.REF] ?? '';
    if (!refCell) continue;
    const m = REF_RE.exec(refCell);
    const variantKey = row[COL.VARIANT] ?? '';
    const matches =
      m?.groups &&
      m.groups.key.toLowerCase() === rowKey.toLowerCase() &&
      m.groups.variant.toLowerCase() === variantKey.toLowerCase();
    if (!matches) {
      issues.warnings.push(`Dòng "${rowKey}": cột ref "${refCell}" không khớp @${rowKey}/${variantKey}.`);
    }
  }
}

/**
 * PURE parse of an already-read workbook (ArrayBuffer) → { stages, issues }. A missing `Stages`
 * sheet or missing required columns (stage + variant) is a blocking error. An EMPTY sheet is
 * legal (stages=[] — the root still confirms before replacing with nothing).
 */
export function parseStagesWorkbook(
  data: ArrayBuffer | Uint8Array,
  XLSX: typeof import('xlsx'),
): StageImportParse {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wb = XLSX.read(bytes, { type: 'array' });
  const issues: StageImportIssues = { errors: [], warnings: [] };

  const ws = wb.Sheets[STAGE_IMPORT_SHEET.sheet];
  if (!ws) {
    log.warn('parseStagesWorkbook', 'sheet not found', { sheets: wb.SheetNames });
    issues.errors.push(`Không tìm thấy sheet "${STAGE_IMPORT_SHEET.sheet}" trong file.`);
    return { stages: [], issues };
  }

  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false }) as unknown[][];
  const headerCells = (matrix[0] ?? []).map((c) => cellStr(c).toLowerCase());
  const missing = [STAGE_IMPORT_SHEET.keyColumn, COL.VARIANT].filter((col) => !headerCells.includes(col));
  if (missing.length > 0) {
    log.warn('parseStagesWorkbook', 'missing required columns', { missing, headerCells });
    issues.errors.push(`Sheet "${STAGE_IMPORT_SHEET.sheet}" thiếu cột bắt buộc: ${missing.join(', ')}.`);
    return { stages: [], issues };
  }

  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Array<Record<string, unknown>>;
  const rows = rawRows.map(normalizeRow);
  const stages = parseStages(rows);
  validateStageImport(stages, rows, issues);

  log.info('parseStagesWorkbook', 'done', {
    stageCount: stages.length,
    errorCount: issues.errors.length,
    warningCount: issues.warnings.length,
  });
  return { stages, issues };
}

/**
 * Read an .xlsx File → { stages, issues }. Lazy-imports xlsx so SheetJS stays out of the initial
 * bundle. Parse-only — the root owns confirm + store write + gateway persist.
 */
export async function importStagesFromFile(file: File): Promise<StageImportParse> {
  log.info('importStagesFromFile', 'start', { fileName: file.name, size: file.size });
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  return parseStagesWorkbook(buf, XLSX);
}
