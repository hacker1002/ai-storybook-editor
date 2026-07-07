// get-book-languages — derive a book's ENABLED language options (code + label).
//
// Source of truth = `book.remix.languages` (the book-level availability list, each
// entry carrying `is_enabled`) — the same list the remix/config surfaces consume.
// This is intentionally NOT the full `AVAILABLE_LANGUAGES` catalog: an owner may
// only grant collaborators the languages the book itself has enabled (design
// README §4.3 — "book's enabled languages, do NOT hardcode").
//
// Shared by the sidebar FilterPopover (Phase 03) and the Info-tab LANGUAGES matrix
// (Phase 04), so it lives at the space root as a pure helper.

import type { Book, Language } from '@/types/editor';
import { AVAILABLE_LANGUAGES } from '@/constants/editor-constants';

/**
 * Return the book's enabled languages as `{ code, name }[]`.
 * Falls back to just the original language (label resolved from the catalog when
 * known) if the book has no remix availability list yet.
 */
export function getBookLanguages(book: Book | null): Language[] {
  if (!book) return [];

  const enabled = (book.remix?.languages ?? []).filter((l) => l.is_enabled);
  if (enabled.length > 0) {
    return enabled.map((l) => ({ code: l.code, name: l.name }));
  }

  // Fallback: original language only (map to a catalog label if we recognise it).
  const orig = book.original_language;
  if (!orig) return [];
  const known = AVAILABLE_LANGUAGES.find((l) => l.code === orig);
  return [known ?? { code: orig, name: orig }];
}
