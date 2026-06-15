// import-book-modal.tsx — SHELL ONLY for the "Import from Zip" / "Import from
// Script" flow. Collects the import UI (a name field + a file picker) but does
// NOT read, unzip or parse anything: ingest (full-snapshot unzip for 'zip',
// manuscript Excel parse for 'script') is a separate backend API and is deferred.
// Submit is disabled with an explicit "coming soon" note so the disabled button
// never reads as "broken". No file is read → no attack surface this pass.

import { useCallback } from 'react';
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
import { Field } from './field';

const log = createLogger('Books', 'ImportBookModal');

interface ImportBookModalProps {
  source: ImportSource;
  onClose: () => void;
}

/** Per-source copy. 'zip' = full snapshot archive; 'script' = manuscript file. */
const SOURCE_COPY: Record<ImportSource, { title: string; hint: string; accept: string }> = {
  zip: {
    title: 'Import from Zip',
    hint: 'Upload a book snapshot archive (.zip) to recreate it here.',
    accept: '.zip',
  },
  script: {
    title: 'Import from Script',
    hint: 'Upload a manuscript script (.xlsx / .csv) to start a new book.',
    accept: '.xlsx,.csv',
  },
};

export function ImportBookModal({ source, onClose }: ImportBookModalProps) {
  const copy = SOURCE_COPY[source];
  log.debug('render', 'import shell open', { source });

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
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.hint}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Field label="Book name" htmlFor="import-book-name">
            <Input
              id="import-book-name"
              placeholder="New book name…"
              disabled
            />
          </Field>

          <Field label="File">
            <Input type="file" accept={copy.accept} disabled />
          </Field>

          <p
            role="note"
            className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          >
            Import is coming soon. This panel is a preview — submitting is
            disabled for now.
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
