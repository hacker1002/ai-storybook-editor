// parse-excel-workbook.ts — Excel → intermediate parse model for the book-creation
// import (design 07-01). Reads the entity sheets (positional) and exposes the workbook
// as a `SketchImportWorkbook` adapter so the SHARED sketch-spread parser
// (`sketch-spread-excel.ts`) can build spreads from the SAME workbook (read once).
//
// Flow / Storyboard-cell / node parsing was removed — the new template imports into
// `snapshot.sketch` (no branches) and spread structure is owned by the shared module.

import { createLogger } from '@/utils/logger';
import { SHEET } from './import-script-constants';
import type { ParsedEntityRow } from './import-script-types';
import type {
  Cell,
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

// Columns (positional, per 07-01 §2.3): id | ref | <entity>(key) | variant | description
const ENTITY_COL = { ref: 1, key: 2, variant: 3, description: 4 } as const;

export function parseEntitySheet(
  matrix: SheetMatrix,
  entity_type: ParsedEntityRow['entity_type'],
): ParsedEntityRow[] {
  const rows: ParsedEntityRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const key = cellStr(row[ENTITY_COL.key]);
    if (!key) continue; // skip header-ish / blank rows
    rows.push({
      entity_type,
      key,
      variant_key: cellStr(row[ENTITY_COL.variant]) || 'base',
      ref: cellStr(row[ENTITY_COL.ref]),
      description: cellStr(row[ENTITY_COL.description]),
    });
  }
  return rows;
}

// ── Workbook orchestration (lazy SheetJS) ─────────────────────────────────────

/** Everything the sketch import needs from one Excel file: a workbook adapter for the
 *  shared spread parser + the parsed entity rows. */
export interface ImportedWorkbook {
  spreadsSource: SketchImportWorkbook;
  characters: ParsedEntityRow[];
  props: ParsedEntityRow[];
  stages: ParsedEntityRow[];
}

/** Read a workbook from a File → entity rows + a SketchImportWorkbook adapter.
 *  Lazy `import('xlsx')` keeps SheetJS out of the books bundle until submit. */
export async function parseExcel(file: File): Promise<ImportedWorkbook> {
  log.info('parseExcel', 'start', { fileName: file.name, size: file.size });
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });

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

  const characters = parseEntitySheet(matrixOf(SHEET.CHARACTERS) ?? [], 'character');
  const props = parseEntitySheet(matrixOf(SHEET.PROPS) ?? [], 'prop');
  const stages = parseEntitySheet(matrixOf(SHEET.STAGES) ?? [], 'stage');

  log.info('parseExcel', 'done', {
    characters: characters.length,
    props: props.length,
    stages: stages.length,
  });
  return { spreadsSource, characters, props, stages };
}
