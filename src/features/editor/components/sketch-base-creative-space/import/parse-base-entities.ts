// parse-base-entities.ts — Excel → base entities for BOTH kinds (character + prop) in ONE
// pass (design sketch-base-creative-space/05-import-base-entities.md).
//
// PURE by design (Phase 07 test seam): this module reads + parses + validates only. It NEVER
// confirms, toasts, or writes the store — the root component owns the confirm-replace
// AlertDialog + `setSketchBaseEntities` + `autoSaveSnapshot`. The fully-pure `parseWorkbook`
// operates on an already-read ArrayBuffer so it unit-tests without any File I/O; only
// `importBaseEntities` touches the lazy-imported xlsx runtime + `File.arrayBuffer()`.
//
// COLUMN MAPPING (authoritative 4-column path — flagged Phase 01): each Excel column maps to
// its OWN variant field. `description` is NOT collapsed into `visual_design` (design-03 §72 /
// design-05 §4). Empty cell → '' (the variant is still kept).

import { createLogger } from '@/utils/logger';
import type { BaseKind, SketchEntity, SketchVariant } from '@/types/sketch';
import { COL, IMPORT_SHEETS, REF_IN_TEXT_RE, REF_RE } from './parse-base-entities.constants';

const log = createLogger('Editor', 'ParseBaseEntities');

/** Collected validation results. `errors` block commit; `warnings` are advisory. */
export interface ImportIssues {
  errors: string[];
  warnings: string[];
}

/** Bulk-import payload for `setSketchBaseEntities({ characters, props })`. */
export interface BaseImportResult {
  characters: SketchEntity[];
  props: SketchEntity[];
}

export interface BaseImportParse {
  result: BaseImportResult;
  issues: ImportIssues;
}

/** A header-keyed sheet row: keys lowercased+trimmed, values coerced to trimmed strings. */
export type BaseSheetRow = Record<string, string>;

/** Coerce any raw cell value to a trimmed string ('' for null/undefined). */
function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Normalize a raw header-keyed row → lowercase+trim keys, trimmed string values.
 *  Makes column lookup robust to header casing / surrounding whitespace. */
export function normalizeRow(raw: Record<string, unknown>): BaseSheetRow {
  const out: BaseSheetRow = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.trim().toLowerCase()] = cellStr(v);
  }
  return out;
}

/**
 * Group normalized rows by key column → SketchEntity[]. One row = one variant; entity order =
 * first-seen. Rows with an empty key column are skipped. Each of the four text columns maps to
 * its own variant field (description → description, height → height, …); an absent cell → ''.
 */
export function parseBaseEntities(rows: BaseSheetRow[], keyColumn: string): SketchEntity[] {
  const byKey = new Map<string, SketchEntity>();
  for (const row of rows) {
    const key = row[keyColumn] ?? '';
    if (!key) continue;
    let entity = byKey.get(key);
    if (!entity) {
      entity = { key, variants: [] };
      byKey.set(key, entity);
    }
    const variant: SketchVariant = {
      key: row[COL.VARIANT] ?? '',
      description: row[COL.DESCRIPTION] ?? '',
      height: row[COL.HEIGHT] ?? '',
      visual_design: row[COL.VISUAL_DESIGN] ?? '',
      art_language: row[COL.ART_LANGUAGE] ?? '',
    };
    entity.variants.push(variant);
  }
  return [...byKey.values()];
}

/** Extract inline `@key/variant` refs from a free-text field. */
function extractInlineRefs(text: string): Array<{ key: string; variant: string }> {
  const refs: Array<{ key: string; variant: string }> = [];
  for (const m of text.matchAll(REF_IN_TEXT_RE)) {
    if (m.groups) refs.push({ key: m.groups.key, variant: m.groups.variant });
  }
  return refs;
}

/** The four text fields that may carry inline `@ref` mentions. */
function refBearingFields(v: SketchVariant): string[] {
  return [v.description, v.visual_design, v.art_language, v.height ?? ''];
}

/**
 * Validate one kind's parsed entities against its rows (pure). Errors block commit; warnings are
 * advisory (design §6). `knownKeys` is the char∪prop union so cross-kind `@ref`s resolve
 * (kept verbatim, warn-only). Mutates the shared `issues`.
 *  - error:  duplicate variant key within an entity.
 *  - warn:   not exactly one `base` variant; `ref` column ≠ own `@key/variant`;
 *            inline `@ref` unresolved within char∪prop.
 */
export function validateBaseImport(
  entities: SketchEntity[],
  rows: BaseSheetRow[],
  kind: BaseKind,
  keyColumn: string,
  knownKeys: Map<string, SketchEntity>,
  issues: ImportIssues,
): void {
  for (const entity of entities) {
    // error: duplicate variant key within one entity (breaks @ref identity)
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const v of entity.variants) {
      if (seen.has(v.key)) dups.add(v.key);
      seen.add(v.key);
    }
    if (dups.size > 0) {
      issues.errors.push(`Entity "${entity.key}": variant key trùng: ${[...dups].join(', ')}`);
    }

    // warn: exactly one `base`
    const baseCount = entity.variants.filter((v) => v.key === 'base').length;
    if (baseCount !== 1) {
      issues.warnings.push(`Entity "${entity.key}": cần đúng 1 variant "base" (thấy ${baseCount}).`);
    }

    // warn: inline @ref unresolved within char∪prop (cross-kind kept verbatim)
    for (const v of entity.variants) {
      for (const field of refBearingFields(v)) {
        for (const ref of extractInlineRefs(field)) {
          const target = knownKeys.get(ref.key.toLowerCase());
          if (!target) {
            issues.warnings.push(
              `Entity "${entity.key}" variant "${v.key}": @${ref.key}/${ref.variant} không khớp entity nào (giữ nguyên).`,
            );
          } else if (!target.variants.some((tv) => tv.key.toLowerCase() === ref.variant.toLowerCase())) {
            issues.warnings.push(
              `Entity "${entity.key}" variant "${v.key}": @${ref.key}/${ref.variant} — "${ref.key}" không có variant "${ref.variant}".`,
            );
          }
        }
      }
    }
  }

  // warn: `ref` column should equal the row's own `@key/variant`
  for (const row of rows) {
    const rowKey = row[keyColumn] ?? '';
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
      issues.warnings.push(`Dòng "${rowKey}" (${kind}): cột ref "${refCell}" không khớp @${rowKey}/${variantKey}.`);
    }
  }
}

/**
 * PURE parse of an already-read workbook (ArrayBuffer) → { result, issues }. No File I/O, no
 * store/confirm/toast side-effects — the Phase 07 unit-test seam. A missing sheet or a missing
 * required column (key + variant) is a blocking error (aborts before per-entity validation, so
 * we never import half a book). The four text columns are optional (empty → '').
 */
export function parseWorkbook(data: ArrayBuffer | Uint8Array, XLSX: typeof import('xlsx')): BaseImportParse {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wb = XLSX.read(bytes, { type: 'array' });

  const result: BaseImportResult = { characters: [], props: [] };
  const issues: ImportIssues = { errors: [], warnings: [] };
  const parsedByKind: Partial<Record<BaseKind, { rows: BaseSheetRow[]; keyColumn: string }>> = {};

  for (const { kind, sheet, keyColumn } of IMPORT_SHEETS) {
    const ws = wb.Sheets[sheet];
    if (!ws) {
      log.warn('parseWorkbook', 'sheet not found', { kind, sheet, sheets: wb.SheetNames });
      issues.errors.push(`Không tìm thấy sheet "${sheet}" trong file.`);
      continue;
    }
    // header:1 → first row = headers (for missing required-column detection)
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false }) as unknown[][];
    const headerCells = (matrix[0] ?? []).map((c) => cellStr(c).toLowerCase());
    const missing = [keyColumn, COL.VARIANT].filter((col) => !headerCells.includes(col));
    if (missing.length > 0) {
      log.warn('parseWorkbook', 'missing required columns', { kind, sheet, missing, headerCells });
      issues.errors.push(`Sheet "${sheet}" thiếu cột bắt buộc: ${missing.join(', ')}.`);
      continue;
    }
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Array<Record<string, unknown>>;
    const rows = rawRows.map(normalizeRow);
    result[kind] = parseBaseEntities(rows, keyColumn);
    parsedByKind[kind] = { rows, keyColumn };
  }

  // Sheet-level errors → abort before per-entity validation (don't import half a book).
  if (issues.errors.length === 0) {
    const knownKeys = new Map<string, SketchEntity>(
      [...result.characters, ...result.props].map((e) => [e.key.toLowerCase(), e]),
    );
    for (const { kind } of IMPORT_SHEETS) {
      const parsed = parsedByKind[kind];
      if (parsed) validateBaseImport(result[kind], parsed.rows, kind, parsed.keyColumn, knownKeys, issues);
    }
  }

  log.info('parseWorkbook', 'done', {
    characters: result.characters.length,
    props: result.props.length,
    errorCount: issues.errors.length,
    warningCount: issues.warnings.length,
  });
  return { result, issues };
}

/**
 * Read an .xlsx File → { result, issues } (thin side-effect-free wrapper around `parseWorkbook`).
 * Lazy-imports xlsx so SheetJS stays out of the initial bundle. Does NOT confirm/toast/write the
 * store — the root component owns the commit (parse-only, mirror of parseSketchEntitiesFromFile).
 */
export async function importBaseEntities(file: File): Promise<BaseImportParse> {
  log.info('importBaseEntities', 'start', { fileName: file.name, size: file.size });
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  return parseWorkbook(buf, XLSX);
}
