// parse-sketch-entities.ts — Excel → thin SketchEntity[] for ONE kind (design
// sketch-variants-creative-space/04-import-sketch-entities.md).
//
// PURE by design (Validation Session 1 - Q3): this module reads + parses + validates
// only. It NEVER confirms, toasts, or writes the store — the component (Phase 03) owns
// the confirm-replace AlertDialog + commit. Core logic operates on already-extracted
// header-keyed rows so it unit-tests without SheetJS; only
// `parseSketchEntitiesFromFile` touches the lazy-imported xlsx runtime.

import { createLogger } from '@/utils/logger';
import type { SketchEntity, SketchEntityKind } from '@/types/sketch';
import { COL, IMPORT_SHEET, REF_IN_TEXT_RE, REF_RE } from './parse-sketch-entities.constants';

const log = createLogger('Editor', 'ParseSketchEntities');

/** Collected validation results. `errors` block commit; `warnings` are advisory. */
export interface ImportIssues {
  errors: string[];
  warnings: string[];
}

export interface ParseSketchEntitiesResult {
  entities: SketchEntity[];
  issues: ImportIssues;
}

/** A header-keyed sheet row with keys/values normalized: keys lowercased+trimmed,
 *  values coerced to trimmed strings. */
export type SketchSheetRow = Record<string, string>;

/** Coerce any raw cell value to a trimmed string ('' for null/undefined). */
function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Normalize a raw header-keyed row → lowercase+trim keys, trimmed string values.
 *  Makes column lookup robust to header casing / surrounding whitespace. */
export function normalizeRow(raw: Record<string, unknown>): SketchSheetRow {
  const out: SketchSheetRow = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.trim().toLowerCase()] = cellStr(v);
  }
  return out;
}

/** Group normalized rows by key column → thin SketchEntity[]. One row = one variant;
 *  entity order = first-seen. Rows with an empty key column are skipped. */
export function parseEntities(rows: SketchSheetRow[], keyColumn: string): SketchEntity[] {
  const byKey = new Map<string, SketchEntity>();
  for (const row of rows) {
    const key = row[keyColumn] ?? '';
    if (!key) continue;
    let entity = byKey.get(key);
    if (!entity) {
      entity = { key, variants: [] };
      byKey.set(key, entity);
    }
    // Excel "description" column → variant `visual_design` (thin single-column import; the
    // 4-column import in Phase 06 maps description/height/visual_design/art_language separately).
    entity.variants.push({
      key: row[COL.VARIANT] ?? '',
      description: '',
      visual_design: row[COL.DESCRIPTION] ?? '',
      art_language: '',
    });
  }
  return [...byKey.values()];
}

/** Extract inline `@key/variant` refs from a free-text description. */
function extractInlineRefs(text: string): Array<{ key: string; variant: string }> {
  const refs: Array<{ key: string; variant: string }> = [];
  for (const m of text.matchAll(REF_IN_TEXT_RE)) {
    if (m.groups) refs.push({ key: m.groups.key, variant: m.groups.variant });
  }
  return refs;
}

/**
 * Validate parsed entities against the original rows (pure). Errors block commit;
 * warnings are advisory (per design §4.2 validation table).
 *  - error:  no entity rows; duplicate variant key within an entity.
 *  - warn:   not exactly one `base` variant; `ref` column ≠ own `@key/variant`;
 *            in-description `@ref` unresolved within the same kind (cross-kind kept verbatim).
 */
export function validateSketchImport(
  entities: SketchEntity[],
  rows: SketchSheetRow[],
  kind: SketchEntityKind,
): ImportIssues {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (entities.length === 0) {
    errors.push(`Không tìm thấy dòng ${kind} nào (cột khoá rỗng ở mọi dòng).`);
    return { errors, warnings };
  }

  // Case-insensitive identity map so `@Kid/base` resolves to entity `Kid` (or `kid`).
  // Keys are kept verbatim in the data; only the resolution comparison is normalized.
  const knownKeys = new Map(entities.map((e) => [e.key.toLowerCase(), e]));

  for (const entity of entities) {
    // error: duplicate variant key within one entity (breaks @ref identity)
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const v of entity.variants) {
      if (seen.has(v.key)) dups.add(v.key);
      seen.add(v.key);
    }
    if (dups.size > 0) {
      errors.push(`Entity "${entity.key}": variant key trùng: ${[...dups].join(', ')}`);
    }

    // warn: exactly one `base`
    const baseCount = entity.variants.filter((v) => v.key === 'base').length;
    if (baseCount !== 1) {
      warnings.push(`Entity "${entity.key}": cần đúng 1 variant "base" (thấy ${baseCount}).`);
    }

    // warn: in-description @ref unresolved within same kind (cross-kind kept verbatim)
    for (const v of entity.variants) {
      for (const ref of extractInlineRefs(v.visual_design)) {
        const target = knownKeys.get(ref.key.toLowerCase());
        if (!target) {
          warnings.push(
            `Entity "${entity.key}" variant "${v.key}": @${ref.key}/${ref.variant} không khớp ${kind} nào (giữ nguyên — có thể cross-kind).`,
          );
        } else if (!target.variants.some((tv) => tv.key.toLowerCase() === ref.variant.toLowerCase())) {
          warnings.push(
            `Entity "${entity.key}" variant "${v.key}": @${ref.key}/${ref.variant} — "${ref.key}" không có variant "${ref.variant}".`,
          );
        }
      }
    }
  }

  // warn: `ref` column should equal the row's own `@key/variant`
  const keyColumn = IMPORT_SHEET[kind].keyColumn;
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
      warnings.push(`Dòng "${rowKey}": cột ref "${refCell}" không khớp @${rowKey}/${variantKey}.`);
    }
  }

  return { errors, warnings };
}

/**
 * Read a single kind's sheet from an .xlsx File → { entities, issues } (PURE — no
 * confirm/toast/store side-effect; commit is the component's job). Lazy-imports xlsx so
 * SheetJS stays out of the initial bundle. A missing sheet is a blocking error, not a throw.
 */
export async function parseSketchEntitiesFromFile(
  file: File,
  kind: SketchEntityKind,
): Promise<ParseSketchEntitiesResult> {
  const { sheet, keyColumn } = IMPORT_SHEET[kind];
  log.info('parseSketchEntitiesFromFile', 'start', { kind, sheet, fileName: file.name, size: file.size });

  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });

  const ws = wb.Sheets[sheet];
  if (!ws) {
    log.warn('parseSketchEntitiesFromFile', 'sheet not found', { kind, sheet, sheets: wb.SheetNames });
    return { entities: [], issues: { errors: [`Không tìm thấy sheet "${sheet}" trong file.`], warnings: [] } };
  }

  // header:1 → first row = headers (for missing-column detection)
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false }) as unknown[][];
  const headerCells = (matrix[0] ?? []).map((c) => cellStr(c).toLowerCase());
  const missing = [keyColumn, COL.VARIANT, COL.DESCRIPTION].filter((col) => !headerCells.includes(col));
  if (missing.length > 0) {
    log.warn('parseSketchEntitiesFromFile', 'missing header columns', { kind, sheet, missing, headerCells });
    return { entities: [], issues: { errors: [`Sheet "${sheet}" thiếu cột: ${missing.join(', ')}.`], warnings: [] } };
  }

  const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Array<Record<string, unknown>>;
  const rows = rawRows.map(normalizeRow);
  const entities = parseEntities(rows, keyColumn);
  const issues = validateSketchImport(entities, rows, kind);

  log.info('parseSketchEntitiesFromFile', 'done', {
    kind,
    entityCount: entities.length,
    errorCount: issues.errors.length,
    warningCount: issues.warnings.length,
  });
  return { entities, issues };
}
