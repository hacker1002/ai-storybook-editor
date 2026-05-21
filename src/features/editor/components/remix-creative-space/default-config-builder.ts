// default-config-builder.ts — Pure helper to derive a fresh RemixConfig draft
// from the book-level BookRemix availability list.

import type { BookRemix } from '@/types/editor';
import type { RemixConfig } from '@/types/remix';
import { NARRATOR_VOICE_KEY } from '@/constants/config-constants';

// Narrator voice availability now lives in book.remix.voices[] (key='narrator').
// Full per-character voice draft port is a follow-up; this keeps the existing
// singular-narrator RemixConfig shape by reading just the narrator voice slot.
const isNarratorVoiceEnabled = (book: BookRemix): boolean =>
  book.voices.some((v) => v.key === NARRATOR_VOICE_KEY && v.is_enabled);

export function defaultConfigFromBookRemix(book: BookRemix): RemixConfig {
  return {
    narrator: isNarratorVoiceEnabled(book)
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
    book.voices.every((v) => !v.is_enabled) &&
    book.characters.every((c) => !c.is_enabled) &&
    book.props.every((p) => !p.is_enabled) &&
    book.languages.every((l) => !l.is_enabled)
  );
}
