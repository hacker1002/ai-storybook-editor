// Pure client-side filtering for the books list (README §2.3).
// No logger here on purpose: `applyFilters` runs inside a render-time `useMemo`
// on every keystroke — logging would be hot-path noise.

import type { BookListItem } from '@/types/editor';
import type { BooksFilterState } from '../types';

/** Case-insensitive match against title + description (description may be null). */
export function matchSearch(book: BookListItem, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const title = (book.title ?? '').toLowerCase();
  const description = (book.description ?? '').toLowerCase();
  return title.includes(q) || description.includes(q);
}

/** Filter by step (skip when `'all'`) then by search query. */
export function applyFilters(
  books: BookListItem[],
  filters: BooksFilterState,
): BookListItem[] {
  const { search, step } = filters;
  return books.filter((book) => {
    if (step !== 'all' && book.step !== step) return false;
    return matchSearch(book, search);
  });
}
