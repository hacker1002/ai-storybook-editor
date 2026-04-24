// script-resolver.ts — Replace `@{speaker_key}:` with `@{eleven_id}:` ready for
// the narrate-script API. Accumulates per-turn errors so the UI can surface all
// issues at once.

import { createLogger } from '@/utils/logger';
import type { NarratorSettings, NarratorLanguageEntry } from '@/types/editor';
import type { Character } from '@/types/character-types';
import type { Voice } from '@/types/voice';
import { parseTurns } from './script-parser';

const log = createLogger('NarrationHelpers', 'ScriptResolver');

export type ResolveReason =
  | 'unknown_key'
  | 'narrator_no_voice_for_lang'
  | 'character_no_voice_setting'
  | 'voice_deleted';

export interface ResolveError {
  speakerKey: string;
  reason: ResolveReason;
}

export interface ResolveContext {
  narrator: NarratorSettings | null;
  charactersByKey: Map<string, Character>;
  voicesById: Map<string, Voice>;
  currentLanguage: string;
  /** Fallback language when the current one has no narrator voice entry. */
  originalLanguage: string;
}

export type ResolveResult =
  | { ok: true; value: string }
  | { ok: false; errors: ResolveError[] };

/** Read narrator entry for a language key, or null if shape is wrong. */
function readNarratorEntry(
  narrator: NarratorSettings | null,
  languageKey: string,
): NarratorLanguageEntry | null {
  if (!narrator) return null;
  const entry = narrator[languageKey];
  if (entry && typeof entry === 'object' && 'voice_id' in entry) {
    return entry as NarratorLanguageEntry;
  }
  return null;
}

/** Resolve the voice_id (Supabase voices.id) for a given speaker key. */
function resolveVoiceId(
  speakerKey: string,
  ctx: ResolveContext,
): { value: string } | { error: ResolveError } {
  if (speakerKey === 'narrator') {
    const primary = readNarratorEntry(ctx.narrator, ctx.currentLanguage);
    const fallback =
      primary ?? readNarratorEntry(ctx.narrator, ctx.originalLanguage);
    if (!fallback?.voice_id) {
      return {
        error: { speakerKey, reason: 'narrator_no_voice_for_lang' },
      };
    }
    return { value: fallback.voice_id };
  }

  const char = ctx.charactersByKey.get(speakerKey);
  if (!char) {
    return { error: { speakerKey, reason: 'unknown_key' } };
  }
  const voiceId = char.voice_setting?.voice_id;
  if (!voiceId) {
    return { error: { speakerKey, reason: 'character_no_voice_setting' } };
  }
  return { value: voiceId };
}

/**
 * Resolve all `@{speaker_key}:` prefixes to `@{eleven_id}:`. Accumulates all
 * errors (no early return) so the UI can show every unresolved speaker in one
 * pass.
 */
export function resolveScriptKeys(
  script: string,
  ctx: ResolveContext,
): ResolveResult {
  const turns = parseTurns(script);
  const errors: ResolveError[] = [];
  let resolved = script;

  // Track per-speaker to avoid repeating errors when a speaker appears twice.
  const seen = new Set<string>();

  for (const turn of turns) {
    if (seen.has(turn.speakerKey)) continue;
    seen.add(turn.speakerKey);

    const result = resolveVoiceId(turn.speakerKey, ctx);
    if ('error' in result) {
      errors.push(result.error);
      continue;
    }
    const voice = ctx.voicesById.get(result.value);
    if (!voice?.elevenId) {
      errors.push({ speakerKey: turn.speakerKey, reason: 'voice_deleted' });
      continue;
    }
    // Replace every occurrence of this speaker key (escaped for safety).
    const escapedKey = turn.speakerKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keyRegex = new RegExp(`(^|\\n)@${escapedKey}:`, 'g');
    resolved = resolved.replace(keyRegex, `$1@${voice.elevenId}:`);
  }

  if (errors.length > 0) {
    log.warn('resolveScriptKeys', 'unresolved speakers', {
      turnCount: turns.length,
      errorCount: errors.length,
      reasons: errors.map((e) => e.reason),
    });
    return { ok: false, errors };
  }

  return { ok: true, value: resolved };
}
