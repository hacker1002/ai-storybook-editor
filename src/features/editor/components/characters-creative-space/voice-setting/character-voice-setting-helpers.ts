// character-voice-setting-helpers.ts — Pure helpers for reading/cloning CharacterVoiceSetting JSONB.
// Mirrors narrator-helpers.ts pattern. All functions are side-effect free;
// callers feed result into updateCharacterVoiceSetting(characterKey, next).

import {
  DEFAULT_INFERENCE_PARAMS,
  NARRATOR_LANGUAGE_KEY_REGEX,
} from '@/constants/config-constants';
import type {
  CharacterVoicePreviewEntry,
  CharacterVoiceSetting,
} from '@/types/character-types';
import type { NarratorInferenceParams } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'CharacterVoiceSettingHelpers');

const DEFAULT_MODEL = 'eleven_v3';

/** Seed used when prev is null — mirrors DEFAULT_NARRATOR shape minus language keys. */
function emptyVoiceSetting(): CharacterVoiceSetting {
  return {
    voice_id: null,
    model: DEFAULT_MODEL,
    ...DEFAULT_INFERENCE_PARAMS,
  } as CharacterVoiceSetting;
}

/**
 * Pick the 5 inference fields from a (possibly sparse) voice setting object.
 * Falls back to DEFAULT_INFERENCE_PARAMS per field when missing/invalid.
 * Safe to call with null.
 */
export function extractInference(
  vs: CharacterVoiceSetting | null,
): NarratorInferenceParams {
  if (!vs) return { ...DEFAULT_INFERENCE_PARAMS };
  return {
    speed:
      typeof vs.speed === 'number'
        ? vs.speed
        : DEFAULT_INFERENCE_PARAMS.speed,
    stability:
      typeof vs.stability === 'number'
        ? vs.stability
        : DEFAULT_INFERENCE_PARAMS.stability,
    similarity:
      typeof vs.similarity === 'number'
        ? vs.similarity
        : DEFAULT_INFERENCE_PARAMS.similarity,
    exaggeration:
      typeof vs.exaggeration === 'number'
        ? vs.exaggeration
        : DEFAULT_INFERENCE_PARAMS.exaggeration,
    speaker_boost:
      typeof vs.speaker_boost === 'boolean'
        ? vs.speaker_boost
        : DEFAULT_INFERENCE_PARAMS.speaker_boost,
  };
}

/**
 * Read a single language entry (preview media) from voice setting.
 * Returns null if absent, not an object, or the key doesn't match regex.
 */
export function getLanguageEntry(
  vs: CharacterVoiceSetting | null,
  langCode: string,
): CharacterVoicePreviewEntry | null {
  if (!vs) return null;
  if (!NARRATOR_LANGUAGE_KEY_REGEX.test(langCode)) return null;
  const entry = vs[langCode];
  if (!entry || typeof entry !== 'object') return null;
  return entry as CharacterVoicePreviewEntry;
}

/** Build partial object `{ [langKey]: { media_url: null } }` for every language key present in prev. */
function invalidateAllPreviewUrls(
  vs: CharacterVoiceSetting,
): Record<string, CharacterVoicePreviewEntry> {
  const out: Record<string, CharacterVoicePreviewEntry> = {};
  for (const key of Object.keys(vs)) {
    if (NARRATOR_LANGUAGE_KEY_REGEX.test(key)) {
      out[key] = { media_url: null };
    }
  }
  return out;
}

/** Change voice_id; invalidate all preview media_urls across all 5 languages. */
export function buildNextWithVoiceChange(
  prev: CharacterVoiceSetting | null,
  voiceId: string,
): CharacterVoiceSetting {
  const base = prev ? ({ ...prev } as CharacterVoiceSetting) : emptyVoiceSetting();
  const invalidated = invalidateAllPreviewUrls(base);
  const next: CharacterVoiceSetting = {
    ...base,
    ...invalidated,
    voice_id: voiceId,
  } as CharacterVoiceSetting;
  log.debug('buildNextWithVoiceChange', 'voice set + invalidate', {
    voiceId,
    invalidatedLangs: Object.keys(invalidated).length,
  });
  return next;
}

/** Change one inference param. Preserves media_url (S1: user regenerates manually). */
export function buildNextWithInferenceChange<
  K extends keyof NarratorInferenceParams,
>(
  prev: CharacterVoiceSetting | null,
  paramKey: K,
  value: NarratorInferenceParams[K],
): CharacterVoiceSetting {
  const base = prev ? ({ ...prev } as CharacterVoiceSetting) : emptyVoiceSetting();
  const next: CharacterVoiceSetting = { ...base } as CharacterVoiceSetting;
  (next as Record<string, unknown>)[paramKey] = value;
  log.debug('buildNextWithInferenceChange', 'param updated (media preserved)', { paramKey });
  return next;
}

/** Merge a full inference snapshot. Preserves media_url (S1). */
export function buildNextWithInferenceMerge(
  prev: CharacterVoiceSetting | null,
  inference: NarratorInferenceParams,
): CharacterVoiceSetting {
  const base = prev ? ({ ...prev } as CharacterVoiceSetting) : emptyVoiceSetting();
  const next: CharacterVoiceSetting = {
    ...base,
    ...inference,
  } as CharacterVoiceSetting;
  log.debug('buildNextWithInferenceMerge', 'inference merged (media preserved)');
  return next;
}

/** Persist media_url after preview render succeeds. Other languages untouched. */
export function buildNextWithMediaUrl(
  prev: CharacterVoiceSetting | null,
  langCode: string,
  mediaUrl: string,
): CharacterVoiceSetting {
  if (!NARRATOR_LANGUAGE_KEY_REGEX.test(langCode)) {
    log.warn('buildNextWithMediaUrl', 'invalid langCode', { langCode });
  }
  const base = prev ? ({ ...prev } as CharacterVoiceSetting) : emptyVoiceSetting();
  const entry: CharacterVoicePreviewEntry = { media_url: mediaUrl };
  const next: CharacterVoiceSetting = { ...base } as CharacterVoiceSetting;
  (next as Record<string, unknown>)[langCode] = entry;
  log.debug('buildNextWithMediaUrl', 'media_url set', { langCode });
  return next;
}

/** Reset 5 inference params back to defaults; keep voice_id and media_urls (S1). */
export function buildNextWithInferenceReset(
  prev: CharacterVoiceSetting | null,
): CharacterVoiceSetting {
  const base = prev ? ({ ...prev } as CharacterVoiceSetting) : emptyVoiceSetting();
  const next: CharacterVoiceSetting = {
    ...base,
    ...DEFAULT_INFERENCE_PARAMS,
  } as CharacterVoiceSetting;
  log.debug('buildNextWithInferenceReset', 'reset inference (media preserved)');
  return next;
}
