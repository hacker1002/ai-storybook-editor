// build-voice-options.ts — Build the voice picker option list shown inside
// each chunk card. Source = book narrator (per-language) + characters whose
// voice_setting binds a voice_id. Dedup by voice_id (narrator wins on tie).
// Voices not present in `voicesById` are skipped silently — picker / generate
// validation surfaces the broken state per-chunk.

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
  const seen = new Set<string>();

  // ── Narrator entry (per-language, fallback to original_language) ──
  const narratorVoiceId = resolveNarratorVoiceId(
    narrator,
    currentLanguage,
    originalLanguage,
  );
  if (narratorVoiceId && voicesById.has(narratorVoiceId)) {
    const voice = voicesById.get(narratorVoiceId)!;
    opts.push({
      voice_id: voice.id,
      voice_name: voice.name,
      source_label: 'Narrator',
      source_kind: 'narrator',
    });
    seen.add(voice.id);
  }

  // ── Character entries (skip duplicates so narrator wins on tie) ──
  for (const ch of characters) {
    const setting: CharacterVoiceSetting | null = ch.voice_setting ?? null;
    const vid = setting?.voice_id;
    if (!vid || seen.has(vid)) continue;
    const voice = voicesById.get(vid);
    if (!voice) continue;
    opts.push({
      voice_id: voice.id,
      voice_name: voice.name,
      source_label: ch.name,
      source_kind: 'character',
      character_key: ch.key,
    });
    seen.add(voice.id);
  }

  return opts;
}
