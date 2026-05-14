// build-voice-options.ts — Build the voice picker option list shown inside
// each chunk card. Source = book narrator (per-language) + characters whose
// voice_setting binds a voice_id. Reader-centric (2026-05-14): emit one entry
// per reader (narrator + each character with a voice), NO dedup by voice_id —
// shared voices produce multiple entries so user picks WHO reads, not which
// voice. Voices not present in `voicesById` are skipped silently — picker /
// generate validation surfaces the broken state per-chunk.

import { NARRATOR_KEY } from '@/apis/text-api';
import type { Character, CharacterVoiceSetting } from '@/types/character-types';
import type { NarratorSettings } from '@/types/editor';
import type { Voice } from '@/types/voice';
import type { VoiceOption } from '../components/chunk-types';

/**
 * Resolve the narrator voice_id for the active language with fallback to the
 * book's original_language entry, then `null` when neither is set.
 */
export function resolveNarratorVoiceId(
  narrator: NarratorSettings | null,
  currentLanguage: string,
  originalLanguage: string | null,
): string | null {
  if (!narrator) return null;
  const langEntry = readLangEntry(narrator, currentLanguage);
  if (langEntry?.voice_id) return langEntry.voice_id;
  if (originalLanguage && originalLanguage !== currentLanguage) {
    const fallback = readLangEntry(narrator, originalLanguage);
    if (fallback?.voice_id) return fallback.voice_id;
  }
  return null;
}

function readLangEntry(
  narrator: NarratorSettings,
  langKey: string,
): { voice_id?: string } | null {
  const value = (narrator as unknown as Record<string, unknown>)[langKey];
  if (value && typeof value === 'object' && 'voice_id' in value) {
    const vid = (value as { voice_id?: unknown }).voice_id;
    if (typeof vid === 'string' && vid.length > 0) {
      return { voice_id: vid };
    }
  }
  return null;
}

export interface BuildVoiceOptionsParams {
  narrator: NarratorSettings | null;
  characters: Character[];
  voicesById: Map<string, Voice>;
  currentLanguage: string;
  originalLanguage: string | null;
}

export function buildVoiceOptions(params: BuildVoiceOptionsParams): VoiceOption[] {
  const { narrator, characters, voicesById, currentLanguage, originalLanguage } =
    params;

  const opts: VoiceOption[] = [];
  const seenReaderKeys = new Set<string>();

  // ── Narrator entry (per-language, fallback to original_language) ──
  const narratorVoiceId = resolveNarratorVoiceId(
    narrator,
    currentLanguage,
    originalLanguage,
  );
  if (narratorVoiceId && voicesById.has(narratorVoiceId)) {
    const voice = voicesById.get(narratorVoiceId)!;
    opts.push({
      reader_key: NARRATOR_KEY,
      voice_id: voice.id,
      voice_name: voice.name,
      source_label: 'Narrator',
      source_kind: 'narrator',
    });
    seenReaderKeys.add(NARRATOR_KEY);
  }

  // ── Character entries (one per character with a usable voice — NO voice dedup) ──
  // Reader without voice → skip (preserves prior contract: voice_setting missing =
  // not eligible as reader). Duplicate character.key (data bug) → skip second.
  for (const ch of characters) {
    if (!ch.key || seenReaderKeys.has(ch.key)) continue;
    const setting: CharacterVoiceSetting | null = ch.voice_setting ?? null;
    const vid = setting?.voice_id;
    if (!vid) continue;
    const voice = voicesById.get(vid);
    if (!voice) continue;
    opts.push({
      reader_key: ch.key,
      voice_id: voice.id,
      voice_name: voice.name,
      source_label: ch.name,
      source_kind: 'character',
    });
    seenReaderKeys.add(ch.key);
  }

  return opts;
}
