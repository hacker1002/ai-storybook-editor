// import-script-pipeline.ts — Orchestrates the client-side import (design spec §5):
// parseExcel → assembleSnapshot → validate → (errors? stop, no write) →
// createImportedBook. Returns a stable contract the modal renders directly. The
// snapshot is built + validated in-memory BEFORE any DB write (atomicity §9).

import { createLogger } from '@/utils/logger';
import { parseExcel } from './parse-excel-workbook';
import { assembleSnapshot } from './build-snapshot-from-parsed';
import { validateImportSnapshot } from './validate-import-snapshot';
import { createImportedBook } from './create-imported-book';
import type { ImportModalMeta, ImportScriptResult } from './import-script-types';

const log = createLogger('Books', 'ImportScriptPipeline');

export async function importScript(file: File, meta: ImportModalMeta): Promise<ImportScriptResult> {
  log.info('importScript', 'start', { fileName: file.name, title: meta.title });
  try {
    const parsed = await parseExcel(file);
    const snapshot = assembleSnapshot(parsed, meta);
    const { errors, warnings } = validateImportSnapshot(snapshot, parsed, meta);

    if (errors.length > 0) {
      log.warn('importScript', 'validation failed — no write', {
        errorCount: errors.length,
        warningCount: warnings.length,
      });
      return { ok: false, errors, warnings };
    }

    const bookId = await createImportedBook(meta, snapshot);
    log.info('importScript', 'done', { bookId, warningCount: warnings.length });
    return { ok: true, bookId, errors: [], warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('importScript', 'pipeline threw', { message });
    return { ok: false, errors: [message], warnings: [] };
  }
}
