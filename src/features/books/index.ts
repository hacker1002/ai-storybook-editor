// Books feature barrel — extended per phase (BooksPage + components added in phase 02).
export * from './types';
export * from './constants';
export { applyFilters, matchSearch } from './utils/book-filters';

// Components (phase 02)
export { BooksHeader } from './components/books-header';
export { BooksToolbar } from './components/books-toolbar';
export { BooksList } from './components/books-list';
export { BookRow } from './components/book-row';
export { StepBadge } from './components/step-badge';
export { ListSkeleton } from './components/list-skeleton';

// Modals (phase 03)
export { NewBookModal } from './components/new-book-modal';
export { BookDetailsModal } from './components/book-details-modal';
export { ArtStyleSelect } from './components/art-style-select';
export { Field } from './components/field';

// Delete + Import (phase 04)
export { DeleteBookDialog } from './components/delete-book-dialog';
export { ImportBookModal } from './components/import-book-modal';

// Page (phase 02)
export { BooksPage } from './pages/books-page';
