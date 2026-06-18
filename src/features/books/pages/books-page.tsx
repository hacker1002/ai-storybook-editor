// books-page.tsx — Root of the /books library page. Owns store wiring + local UI
// state, derives the type=1 ("normal book") scope client-side, applies filters via
// useMemo, fetches on mount, and orchestrates Header / Toolbar / (Skeleton | List).
//
// Modal handlers in THIS phase only set local state (isNewOpen, detailsBook,
// importSource, deletingBook) — the actual modals are rendered in phases 03/04.
// onEdit navigates to the editor; row-body open routes to the (future) details modal.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  applyFilters,
  BookDetailsModal,
  BooksHeader,
  BooksList,
  BooksToolbar,
  DEFAULT_BOOKS_FILTERS,
  DeleteBookDialog,
  ImportBookModal,
  ListSkeleton,
  NewBookModal,
  type BooksFilterState,
  type ImportSource,
} from '@/features/books';
import { useBooks, useBooksLoading, useBookActions } from '@/stores/book-store';
import type { BookListItem } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Books', 'BooksPage');

/** Library scope: only "normal" books (type === 1). Source books (type 0) excluded. */
const NORMAL_BOOK_TYPE = 1;

export function BooksPage() {
  const navigate = useNavigate();
  const books = useBooks();
  const isLoading = useBooksLoading();
  const { fetchBooks } = useBookActions();

  const [filters, setFilters] = useState<BooksFilterState>(DEFAULT_BOOKS_FILTERS);

  // Modal/dialog state — wired here; the modal components themselves land in
  // phases 03 (new + details) and 04 (delete + import). Placeholders for now.
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [detailsBook, setDetailsBook] = useState<BookListItem | null>(null);
  const [importSource, setImportSource] = useState<ImportSource | null>(null);
  const [deletingBook, setDeletingBook] = useState<BookListItem | null>(null);

  useEffect(() => {
    log.info('mount', 'fetching books');
    void fetchBooks();
  }, [fetchBooks]);

  // type=1 scope is derived client-side (fetchBooks query is shared with the
  // editor's useIsSourceBook). Keep memo keys on stable raw refs.
  const normalBooks = useMemo(
    () => books.filter((b) => b.type === NORMAL_BOOK_TYPE),
    [books],
  );
  const filtered = useMemo(
    () => applyFilters(normalBooks, filters),
    [normalBooks, filters],
  );
  const isLibraryEmpty = normalBooks.length === 0;

  const handleNew = useCallback(() => {
    log.debug('handleNew', 'open new-book');
    setIsNewOpen(true);
  }, []);

  // Create-success (validated S1): STAY on /books + toast. The new row is already
  // unshifted into books[] by the store's createBook — no navigate, no manual upsert.
  const handleCreated = useCallback((created: { id: string }) => {
    log.info('handleCreated', 'book created, staying on /books', { id: created.id });
    toast.success('Book created');
    setIsNewOpen(false);
  }, []);

  const handleImportZip = useCallback(() => {
    log.debug('handleImportZip', 'open import zip (phase 04)');
    setImportSource('zip');
  }, []);

  const handleImportScript = useCallback(() => {
    log.debug('handleImportScript', 'open import script (phase 04)');
    setImportSource('script');
  }, []);

  const handleOpenDetails = useCallback((book: BookListItem) => {
    log.debug('handleOpenDetails', 'open details', { id: book.id });
    setDetailsBook(book);
  }, []);

  const handleEdit = useCallback(
    (book: BookListItem) => {
      log.info('handleEdit', 'navigate editor', { id: book.id });
      navigate(`/editor/${book.id}`);
    },
    [navigate],
  );

  // Import-success: close the modal + navigate to the editor on the new book.
  const handleImported = useCallback(
    (bookId: string) => {
      log.info('handleImported', 'import ok, navigate editor', { id: bookId });
      setImportSource(null);
      navigate(`/editor/${bookId}`);
    },
    [navigate],
  );

  const handleDelete = useCallback((book: BookListItem) => {
    log.debug('handleDelete', 'open delete dialog (phase 04)', { id: book.id });
    setDeletingBook(book);
  }, []);

  return (
    <main aria-labelledby="books-heading" className="w-full">
      <BooksHeader
        onNew={handleNew}
        onImportZip={handleImportZip}
        onImportScript={handleImportScript}
      />
      <BooksToolbar
        filters={filters}
        count={filtered.length}
        onChange={setFilters}
      />
      {/* Skeleton only on the FIRST load (empty store). Subsequent shared-flag
          toggles — detail fetchBook(), createBook() — must NOT blank a populated
          list (they share the store's single isLoading). */}
      {isLoading && books.length === 0 ? (
        <ListSkeleton rows={6} />
      ) : (
        <BooksList
          books={filtered}
          isLibraryEmpty={isLibraryEmpty}
          onOpenDetails={handleOpenDetails}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onNew={handleNew}
        />
      )}

      {isNewOpen && (
        <NewBookModal onClose={() => setIsNewOpen(false)} onCreated={handleCreated} />
      )}
      {detailsBook && (
        <BookDetailsModal
          book={detailsBook}
          onClose={() => setDetailsBook(null)}
          onEdit={handleEdit}
        />
      )}

      {importSource && (
        <ImportBookModal
          source={importSource}
          onClose={() => setImportSource(null)}
          onImported={handleImported}
        />
      )}
      {deletingBook && (
        <DeleteBookDialog book={deletingBook} onClose={() => setDeletingBook(null)} />
      )}
    </main>
  );
}
