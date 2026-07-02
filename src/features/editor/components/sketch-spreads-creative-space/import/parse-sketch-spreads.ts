// parse-sketch-spreads.ts — editor `＋` sketch-spread import. THIN wrapper: reads the
// `.xlsx` File (lazy SheetJS) → SketchImportWorkbook adapter → the SHARED new-template
// parser (`buildSketchSpreadsFromWorkbook`, books/import-script/sketch-spread-excel.ts),
// which is the single source of truth for both this surface and the book-creation import
// (07-01). PURE of UI side-effects: no confirm/toast/store — that is the component's job.
//
// Contract preserved for the component: `parseSketchSpreadsFromFile(file, book)` +
// `ParseSketchSpreadsResult`. The legacy old-template logic (parseChiDao / AD_SUBFIELD /
// per-page single-lang buildTextbox / parseStoryboard 4-row) has been removed.

import { buildSketchSpreadsFromWorkbook } from '@/features/books/import-script/sketch-spread-excel';
import { STORYBOARD_SHEET } from '@/features/books/import-script/sketch-spread-excel.constants';
import type {
  ParseSketchSpreadsResult,
  SheetMatrix,
  SketchImportBook,
  SketchImportWorkbook,
} from '@/features/books/import-script/sketch-spread-excel.types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ParseSketchSpreads');

// Re-export the shared contract types so existing component imports keep working.
export type {
  ParseSketchSpreadsResult,
  ImportIssues,
  SketchImportBook,
} from '@/features/books/import-script/sketch-spread-excel.types';

/**
 * Read a `.xlsx` File → { spreads, issues } (PURE of side-effects). Lazy-imports xlsx.
 * A missing/empty Storyboard sheet surfaces as a blocking error (from the shared parser),
 * never a throw; an unreadable file is reported as an error too.
 */
export async function parseSketchSpreadsFromFile(
  file: File,
  book: SketchImportBook,
): Promise<ParseSketchSpreadsResult> {
  log.info('parseSketchSpreadsFromFile', 'start', { fileName: file.name, size: file.size });

  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  let realWb: ReturnType<typeof XLSX.read>;
  try {
    realWb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  } catch (err) {
    log.error('parseSketchSpreadsFromFile', 'read failed', { error: String(err) });
    return { spreads: [], issues: { errors: ['Could not read the Excel file.'], warnings: [] } };
  }

  const wb: SketchImportWorkbook = {
    SheetNames: realWb.SheetNames,
    sheetMatrix: (name) => {
      const sheet = realWb.Sheets[name];
      if (!sheet) return null;
      return XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        blankrows: false,
      }) as unknown as SheetMatrix;
    },
  };

  const result = buildSketchSpreadsFromWorkbook(wb, book);
  log.info('parseSketchSpreadsFromFile', 'done', {
    sheet: STORYBOARD_SHEET,
    spreadCount: result.spreads.length,
    errorCount: result.issues.errors.length,
    warningCount: result.issues.warnings.length,
  });
  return result;
}
