// parse-excel-workbook.ts — Excel → intermediate parse model for the book-creation
// import (design 07-01). Reads the entity sheets BY HEADER NAME and exposes the workbook
// as a `SketchImportWorkbook` adapter so the SHARED sketch-spread parser
// (`sketch-spread-excel.ts`) can build spreads from the SAME workbook (read once).
//
// ⚡ 2026-07-20: entity columns are looked up by header, never by index — the Stages sheet
// has no `height` column, so positional indices shifted `visual_design`/`art_language` by one
// (they were silently dropped, `visual_design` receiving the `description` text instead).
//
// Flow / Storyboard-cell / node parsing was removed — the new template imports into
// `snapshot.sketch` (no branches) and spread structure is owned by the shared module.

import { createLogger } from '@/utils/logger';
import { ENTITY_COL, ENTITY_KEY_COL, SHEET } from './import-script-constants';
import type { ParsedEntityRow } from './import-script-types';
import type {
  Cell,
  ImportIssues,
  SheetMatrix,
  SketchImportWorkbook,
} from './sketch-spread-excel.types';

const log = createLogger('Books', 'ParseExcelWorkbook');

/** Coerce a raw cell to a trimmed string ('' when blank). */
function cellStr(v: Cell): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

// ── Entity sheets ─────────────────────────────────────────────────────────────

type EntityType = ParsedEntityRow['entity_type'];

/** REQUIRED headers — without them no row can be identified (the key column names the entity,
 *  `variant` names the row's variant). Missing → BLOCKING error, mirroring the base-space
 *  re-import (`parse-base-entities.ts::parseWorkbook`): silently importing 0 entities and
 *  landing the user in an empty catalog is worse than refusing the file. */
function requiredColumns(entityType: EntityType): string[] {
  return [ENTITY_KEY_COL[entityType], ENTITY_COL.VARIANT];
}

/** ADVISORY headers — an older workbook may lack them; the row still imports with '' values.
 *  Stages carry NO `height` (`SketchStageVariant` has no such field) → not expected there. */
function advisoryColumns(entityType: EntityType): string[] {
  const cols = [
    ENTITY_COL.REF,
    ENTITY_COL.DESCRIPTION,
    ENTITY_COL.VISUAL_DESIGN,
    ENTITY_COL.ART_LANGUAGE,
  ];
  return entityType === 'stage' ? cols : [...cols, ENTITY_COL.HEIGHT];
}

export interface ParsedEntitySheet {
  rows: ParsedEntityRow[];
  /** Advisory headers absent from row 0 — the import still proceeds, the corresponding
   *  fields land as '' / null (older workbooks lack the newer columns). */
  missingColumns: string[];
  /** Required headers (key + `variant`) absent from row 0 — BLOCKING. `rows` is [] in that
   *  case: no row is addressable, so parsing on would fabricate an empty catalog. */
  missingRequired: string[];
}

/** Parse one entity sheet matrix (row 0 = headers) → variant rows + missing-column report. */
export function parseEntitySheet(
  matrix: SheetMatrix,
  entity_type: EntityType,
): ParsedEntitySheet {
  const header = (matrix[0] ?? []).map((c) => cellStr(c).toLowerCase());
  const missingRequired = requiredColumns(entity_type).filter((c) => !header.includes(c));
  const missingColumns = advisoryColumns(entity_type).filter((c) => !header.includes(c));
  if (missingRequired.length > 0) {
    log.warn('parseEntitySheet', 'required columns missing from header — no rows read', {
      entity_type,
      missingRequired,
      headerCount: header.length,
    });
    return { rows: [], missingColumns, missingRequired };
  }
  if (missingColumns.length > 0) {
    log.warn('parseEntitySheet', 'expected columns missing from header', {
      entity_type,
      missingColumns,
    });
  }

  /** Read a cell by header name — an absent column reads as '' (never throws). */
  const at = (row: Cell[], column: string): string => {
    const i = header.indexOf(column);
    return i < 0 ? '' : cellStr(row[i]);
  };

  const keyColumn = ENTITY_KEY_COL[entity_type];
  const rows: ParsedEntityRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const key = at(row, keyColumn);
    if (!key) continue; // skip header-ish / blank rows
    rows.push({
      entity_type,
      key,
      variant_key: at(row, ENTITY_COL.VARIANT) || 'base',
      ref: at(row, ENTITY_COL.REF),
      description: at(row, ENTITY_COL.DESCRIPTION),
      visual_design: at(row, ENTITY_COL.VISUAL_DESIGN),
      art_language: at(row, ENTITY_COL.ART_LANGUAGE),
      height: entity_type === 'stage' ? '' : at(row, ENTITY_COL.HEIGHT),
    });
  }

  log.debug('parseEntitySheet', 'sheet parsed', {
    entity_type,
    rowCount: rows.length,
    missingCount: missingColumns.length,
  });
  return { rows, missingColumns, missingRequired: [] };
}

// ── Workbook orchestration (lazy SheetJS) ─────────────────────────────────────

/** Everything the sketch import needs from one Excel file: a workbook adapter for the
 *  shared spread parser + the parsed entity rows + advisory entity-sheet issues. */
export interface ImportedWorkbook {
  spreadsSource: SketchImportWorkbook;
  characters: ParsedEntityRow[];
  props: ParsedEntityRow[];
  stages: ParsedEntityRow[];
  /** Entity-sheet advisories (missing sheet / missing columns). Merged into the spread-parse
   *  issues by `assembleSketchSnapshot` → surfaced in the import modal warning block. */
  issues: ImportIssues;
}

/**
 * PURE parse of an already-read workbook (test seam — no File I/O, mirrors the base-space
 * `parseWorkbook`). Column policy:
 *  - a sheet WITH a header row whose key column (`character`/`prop`/`stage`) or `variant` is
 *    missing → BLOCKING error (no row is addressable; same rule as `parse-base-entities.ts`),
 *    so the pipeline writes nothing.
 *  - a missing / completely blank entity SHEET, or any advisory column (`ref`/`description`/
 *    `visual_design`/`art_language`/`height`) → warning; the import proceeds with empty values.
 */
export function parseImportWorkbook(
  data: ArrayBuffer | Uint8Array,
  XLSX: typeof import('xlsx'),
): ImportedWorkbook {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const wb = XLSX.read(bytes, { type: 'array' });

  const matrixOf = (name: string): SheetMatrix | null => {
    const sheet = wb.Sheets[name];
    if (!sheet) return null;
    return XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as unknown as SheetMatrix;
  };

  const spreadsSource: SketchImportWorkbook = {
    SheetNames: wb.SheetNames,
    sheetMatrix: matrixOf,
  };

  const issues: ImportIssues = { errors: [], warnings: [] };

  const readEntitySheet = (sheetName: string, entity_type: EntityType): ParsedEntityRow[] => {
    const matrix = matrixOf(sheetName);
    if (!matrix) {
      log.warn('readEntitySheet', 'entity sheet not found', { sheetName, entity_type });
      issues.warnings.push(`Không tìm thấy sheet "${sheetName}" — bỏ qua danh mục này.`);
      return [];
    }
    // A COMPLETELY BLANK sheet (not even a header row) is the "this book has no props/stages"
    // shape — same meaning as an absent sheet, so it stays advisory. Only a sheet that HAS a
    // header row yet lacks the key/`variant` column is blocking below.
    if (matrix.length === 0) {
      log.warn('readEntitySheet', 'entity sheet is empty', { sheetName, entity_type });
      issues.warnings.push(`Sheet "${sheetName}" trống — bỏ qua danh mục này.`);
      return [];
    }
    const { rows, missingColumns, missingRequired } = parseEntitySheet(matrix, entity_type);
    if (missingRequired.length > 0) {
      // Blocking: the sheet has a header row but its rows cannot be identified → refuse the
      // import instead of quietly creating a book with an empty catalog. `warn`, not `error`:
      // this is a rejected user input already surfaced in the modal, not a system failure.
      log.warn('readEntitySheet', 'entity sheet missing required columns', {
        sheetName,
        entity_type,
        missingRequired,
      });
      issues.errors.push(
        `Sheet "${sheetName}" thiếu cột bắt buộc: ${missingRequired.join(', ')} — không thể import (hãy dùng template mới).`,
      );
      return [];
    }
    if (missingColumns.length > 0) {
      issues.warnings.push(
        `Sheet "${sheetName}" thiếu cột: ${missingColumns.join(', ')} — import vẫn tiếp tục, các trường này để trống (hãy dùng template mới).`,
      );
    }
    return rows;
  };

  const characters = readEntitySheet(SHEET.CHARACTERS, 'character');
  const props = readEntitySheet(SHEET.PROPS, 'prop');
  const stages = readEntitySheet(SHEET.STAGES, 'stage');

  log.info('parseImportWorkbook', 'done', {
    characters: characters.length,
    props: props.length,
    stages: stages.length,
    warningCount: issues.warnings.length,
    errorCount: issues.errors.length,
  });
  return { spreadsSource, characters, props, stages, issues };
}

/** Read a workbook from a File → entity rows + a SketchImportWorkbook adapter.
 *  Lazy `import('xlsx')` keeps SheetJS out of the books bundle until submit. */
export async function parseExcel(file: File): Promise<ImportedWorkbook> {
  log.info('parseExcel', 'start', { fileName: file.name, size: file.size });
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  return parseImportWorkbook(buf, XLSX);
}
