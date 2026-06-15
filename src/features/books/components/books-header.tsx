// books-header.tsx — Title row for the /books page: <h1>Books</h1> + 3 CTA.
// Presentational; emits callbacks, owns no state. Primary "New Book" sits last
// (rightmost / strongest position), import buttons grouped before it.

import { Download, FileUp, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/utils/logger';

const log = createLogger('Books', 'BooksHeader');

interface BooksHeaderProps {
  onNew: () => void;
  onImportZip: () => void;
  onImportScript: () => void;
}

export function BooksHeader({ onNew, onImportZip, onImportScript }: BooksHeaderProps) {
  log.debug('render', 'render header');
  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <h1 id="books-heading" className="text-xl font-semibold text-foreground">
        Books
      </h1>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onImportScript}>
          <FileUp className="mr-1.5 h-4 w-4" />
          Import Script
        </Button>
        <Button variant="outline" onClick={onImportZip}>
          <Download className="mr-1.5 h-4 w-4" />
          Import Zip
        </Button>
        <Button onClick={onNew}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Book
        </Button>
      </div>
    </header>
  );
}
