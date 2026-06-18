// import-book-modal.tsx — Import flow entry. 'script' is now LIVE: collect book
// metadata (shared <BookMetaFields>) + an .xlsx manuscript, then parse → validate
// → atomic write entirely client-side via importScript, and navigate to the editor
// on success. 'zip' (full snapshot archive — needs server media rehost) is still
// deferred and renders a coming-soon shell. The file is read only in-browser
// (SheetJS, lazy-loaded); nothing is uploaded except the resulting snapshot.

import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ImportSource } from '@/features/books/types';
import { createLogger } from '@/utils/logger';
import { importScript } from '@/features/books/import-script/import-script-pipeline';
import type { ImportModalMeta } from '@/features/books/import-script/import-script-types';
import { Field } from './field';
import { BookMetaFields } from './book-meta-fields';
import {
  INITIAL_BOOK_META,
  isBookMetaValid,
  type BookMetaValue,
} from './book-meta-fields-config';

const log = createLogger('Books', 'ImportBookModal');

interface ImportBookModalProps {
  source: ImportSource;
  onClose: () => void;
  /** Called with the new book id on successful import → parent navigates to editor. */
  onImported: (bookId: string) => void;
}

export function ImportBookModal({ source, onClose, onImported }: ImportBookModalProps) {
  log.debug('render', 'import modal open', { source });
  if (source === 'zip') return <ZipComingSoon onClose={onClose} />;
  return <ScriptImport onClose={onClose} onImported={onImported} />;
}

// ── Script import (live) ──────────────────────────────────────────────────────

function ScriptImport({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (bookId: string) => void;
}) {
  const [meta, setMeta] = useState<BookMetaValue>(INITIAL_BOOK_META);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const patch = useCallback(
    (p: Partial<BookMetaValue>) => setMeta((m) => ({ ...m, ...p })),
    [],
  );

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    log.debug('handleFile', 'file picked', { name: picked?.name, size: picked?.size });
    setFile(picked);
    setErrors([]);
    setWarnings([]);
  }, []);

  const canSubmit = isBookMetaValid(meta) && !!file && !loading;

  const handleImport = useCallback(async () => {
    if (!file || !isBookMetaValid(meta) || loading) return;
    log.info('handleImport', 'start', { title: meta.title.trim(), fileName: file.name });
    setLoading(true);
    setErrors([]);
    setWarnings([]);

    const modalMeta: ImportModalMeta = {
      title: meta.title.trim(),
      format_id: meta.formatId,
      dimension: Number(meta.dimension),
      target_audience: Number(meta.targetAudience),
      artstyle_id: meta.artstyleId ?? null,
      original_language: meta.originalLanguage,
    };

    const res = await importScript(file, modalMeta);
    if (res.ok && res.bookId) {
      log.info('handleImport', 'ok, navigating to editor', {
        bookId: res.bookId,
        warningCount: res.warnings.length,
      });
      onImported(res.bookId); // parent unmounts this modal + navigates — keep loading on
      return;
    }

    log.warn('handleImport', 'import failed', {
      errorCount: res.errors.length,
      warningCount: res.warnings.length,
    });
    setErrors(res.errors);
    setWarnings(res.warnings);
    setLoading(false);
  }, [file, meta, loading, onImported]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (loading) return;
      if (!open) onClose();
    },
    [loading, onClose],
  );

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Import from Script</DialogTitle>
          <DialogDescription>
            Upload a manuscript workbook (.xlsx) and fill in the book details to start a new book.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto py-2">
          <BookMetaFields value={meta} onChange={patch} disabled={loading} idPrefix="import-book" />

          <Field label="Manuscript file (.xlsx)">
            <Input type="file" accept=".xlsx" onChange={handleFile} disabled={loading} />
          </Field>
          {file && (
            <p className="truncate text-sm text-muted-foreground">Selected: {file.name}</p>
          )}

          {errors.length > 0 && (
            <div
              role="alert"
              className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2"
            >
              <p className="text-sm font-semibold text-destructive">
                Không thể import ({errors.length} lỗi):
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-destructive">
                {errors.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-400/40 bg-amber-50 px-3 py-2 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Cảnh báo ({warnings.length}):
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-700 dark:text-amber-400">
                {warnings.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!canSubmit}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Importing...' : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Zip import (deferred shell) ───────────────────────────────────────────────

function ZipComingSoon({ onClose }: { onClose: () => void }) {
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose],
  );

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Import from Zip</DialogTitle>
          <DialogDescription>
            Upload a book snapshot archive (.zip) to recreate it here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Book name" htmlFor="import-zip-name">
            <Input id="import-zip-name" placeholder="New book name…" disabled />
          </Field>

          <Field label="File">
            <Input type="file" accept=".zip" disabled />
          </Field>

          <p
            role="note"
            className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          >
            Zip import is coming soon. This panel is a preview — submitting is disabled for now.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled title="Coming soon">
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
