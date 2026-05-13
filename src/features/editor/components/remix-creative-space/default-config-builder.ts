// default-config-builder.ts — Pure helper to derive a fresh RemixConfig draft
// from the book-level BookRemix availability list.

import type { BookRemix } from '@/types/editor';
import type { RemixConfig } from '@/types/remix';

export function defaultConfigFromBookRemix(book: BookRemix): RemixConfig {
  return {
    narrator: book.narrator.is_enabled
      ? { name: '', voice_id: null }
      : undefined,
    characters: book.characters
      .filter((c) => c.is_enabled)
      .map((c) => ({
        key: c.key,
        human_id: null,
        visual: null,
        voice_id: null,
        is_enabled: true,
      })),
    props: book.props
      .filter((p) => p.is_enabled)
      .map((p) => ({
        key: p.key,
        prop_id: null,
        visual: null,
        is_enabled: true,
      })),
    languages: book.languages
      .filter((l) => l.is_enabled)
      .map((l) => ({
        name: l.name,
        code: l.code,
        is_enabled: true,
      })),
  };
}

export function isBookRemixEmpty(book: BookRemix | null): boolean {
  if (!book) return true;
  return (
    !book.narrator.is_enabled &&
    book.characters.every((c) => !c.is_enabled) &&
    book.props.every((p) => !p.is_enabled) &&
    book.languages.every((l) => !l.is_enabled)
  );
}
