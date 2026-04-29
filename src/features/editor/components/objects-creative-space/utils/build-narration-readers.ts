// build-narration-readers.ts — Construct readers[] + readerToVoice map for the
// enhance-narration request. Narrator entry resolved via book.narrator (per-
// language hybrid) with fallback to original_language. Characters contribute
// up to 29 entries (cap aligns with API §4.7), skipping reserved 'narrator'
// key and any key that fails READER_KEY_REGEX.

import { NARRATOR_KEY, READER_KEY_REGEX, type Reader } from '@/apis/text-api';
import { resolveNarratorVoiceId } from '@/features/editor/components/shared-components/generate-narration-modal/helpers/build-voice-options';
import type { Book } from '@/types/editor';
import type { Character } from '@/types/character-types';

const MAX_CHARACTER_READERS = 29;

export function buildNarrationReaders(
  _book: Book | null,
  characters: Character[]
): Reader[] {
  const readers: Reader[] = [{ key: NARRATOR_KEY }];
  const seen = new Set<string>([NARRATOR_KEY]);
  let count = 0;
  for (const ch of characters) {
    if (count >= MAX_CHARACTER_READERS) break;
    if (!ch.key || seen.has(ch.key)) continue;
    if (!READER_KEY_REGEX.test(ch.key)) continue;
    const entry: Reader = { key: ch.key };
    if (ch.name) entry.name = ch.name;
    const desc = ch.basic_info?.description;
    if (desc) entry.description = desc;
    readers.push(entry);
    seen.add(ch.key);
    count++;
  }
  return readers;
}

export function buildNarrationReaderToVoice(
  book: Book | null,
  characters: Character[],
  currentLanguage: string
): Record<string, string> {
  const map: Record<string, string> = {};
  const narratorVoice = resolveNarratorVoiceId(
    book?.narrator ?? null,
    currentLanguage,
    book?.original_language ?? null
  );
  if (narratorVoice) map[NARRATOR_KEY] = narratorVoice;
  for (const ch of characters) {
    if (!ch.key || ch.key === NARRATOR_KEY) continue;
    const voiceId = ch.voice_setting?.voice_id;
    if (typeof voiceId === 'string' && voiceId.length > 0) {
      map[ch.key] = voiceId;
    }
  }
  return map;
}
