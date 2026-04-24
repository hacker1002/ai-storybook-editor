// narrator-helpers.ts — Pure helpers for reading/cloning NarratorSettings JSONB.
// All functions are side-effect free; callers feed result into `updateBook({ narrator })`.
// Parser rule: key match /^[a-z]{2}_[A-Z]{2}$/ → NarratorLanguageEntry; else → literal setting.

import {
  DEFAULT_INFERENCE_PARAMS,
  DEFAULT_NARRATOR,
  NARRATOR_LANGUAGE_KEY_REGEX,
} from '@/constants/config-constants';
import type {
  NarratorInferenceParams,
  NarratorLanguageEntry,
  NarratorSettings,
} from '@/types/editor';
import { createLogger } from '@/utils/logger';

/**
 * Pick the 5 inference fields from a (possibly sparse) narrator settings object.
 * Falls back to DEFAULT_INFERENCE_PARAMS per field when missing/invalid.
 * Safe to call with null.
 */
export function extractInference(
  narrator: NarratorSettings | null,
): NarratorInferenceParams {
  if (!narrator) return { ...DEFAULT_INFERENCE_PARAMS };
  return {
    speed:
      typeof narrator.speed === 'number'
        ? narrator.speed
        : DEFAULT_INFERENCE_PARAMS.speed,
    stability:
      typeof narrator.stability === 'number'
        ? narrator.stability
        : DEFAULT_INFERENCE_PARAMS.stability,
    similarity:
      typeof narrator.similarity === 'number'
        ? narrator.similarity
        : DEFAULT_INFERENCE_PARAMS.similarity,
    style_exaggeration:
      typeof narrator.style_exaggeration === 'number'
        ? narrator.style_exaggeration
        : DEFAULT_INFERENCE_PARAMS.style_exaggeration,
    speaker_boost:
      typeof narrator.speaker_boost === 'boolean'
        ? narrator.speaker_boost
        : DEFAULT_INFERENCE_PARAMS.speaker_boost,
  };
}

/**
 * Read a single language entry from narrator JSONB. Returns null if absent,
 * not an object, or the key doesn't match the language-code regex.
 */
export function getLanguageEntry(
  narrator: NarratorSettings | null,
  langCode: string,
): NarratorLanguageEntry | null {
  if (!narrator) return null;
  if (!NARRATOR_LANGUAGE_KEY_REGEX.test(langCode)) return null;
  const entry = narrator[langCode];
  if (!entry || typeof entry !== 'object') return null;
  return entry as NarratorLanguageEntry;
}

const log = createLogger('Editor', 'NarratorHelpers');

// Keys that belong to the inference-param union (5 fields). Used to type-narrow setters.
export type NarratorInferenceParamKey = keyof NarratorInferenceParams;

export interface SplitNarratorResult {
  inference: NarratorInferenceParams;
  languageEntries: Record<string, NarratorLanguageEntry>;
  model: string;
}

/**
 * Split a hybrid NarratorSettings into structured parts.
 * - `inference`: 5 params (fallback to defaults field-by-field)
 * - `languageEntries`: map of language_code → entry (only keys matching regex)
 * - `model`: string (fallback to DEFAULT_NARRATOR.model)
 */
export function splitNarrator(
  narrator: NarratorSettings | null,
): SplitNarratorResult {
  if (!narrator) {
    log.debug('splitNarrator', 'null input, returning defaults');
    return {
      inference: { ...DEFAULT_INFERENCE_PARAMS },
      languageEntries: {},
      model: DEFAULT_NARRATOR.model,
    };
  }

  const languageEntries: Record<string, NarratorLanguageEntry> = {};
  for (const key of Object.keys(narrator)) {
    if (!NARRATOR_LANGUAGE_KEY_REGEX.test(key)) continue;
    const entry = narrator[key];
    if (entry && typeof entry === 'object') {
      languageEntries[key] = entry as NarratorLanguageEntry;
    }
  }

  const inference: NarratorInferenceParams = {
    speed:
      typeof narrator.speed === 'number'
        ? narrator.speed
        : DEFAULT_INFERENCE_PARAMS.speed,
    stability:
      typeof narrator.stability === 'number'
        ? narrator.stability
        : DEFAULT_INFERENCE_PARAMS.stability,
    similarity:
      typeof narrator.similarity === 'number'
        ? narrator.similarity
        : DEFAULT_INFERENCE_PARAMS.similarity,
    style_exaggeration:
      typeof narrator.style_exaggeration === 'number'
        ? narrator.style_exaggeration
        : DEFAULT_INFERENCE_PARAMS.style_exaggeration,
    speaker_boost:
      typeof narrator.speaker_boost === 'boolean'
        ? narrator.speaker_boost
        : DEFAULT_INFERENCE_PARAMS.speaker_boost,
  };

  const model =
    typeof narrator.model === 'string' ? narrator.model : DEFAULT_NARRATOR.model;

  return { inference, languageEntries, model };
}

/**
 * Set a single inference param (speed/stability/similarity/style_exaggeration/speaker_boost).
 * Per Validation Session 1: does NOT wipe any language media_url — preview invalidation
 * happens only on explicit user Preview click (Phase 02 always-call strategy).
 */
export function buildNextNarratorWithInferenceChange<
  K extends NarratorInferenceParamKey,
>(
  prev: NarratorSettings | null,
  paramKey: K,
  value: NarratorInferenceParams[K],
): NarratorSettings {
  const base: NarratorSettings = prev ? { ...prev } : { ...DEFAULT_NARRATOR };
  (base as Record<string, unknown>)[paramKey] = value;
  log.debug('buildNextNarratorWithInferenceChange', 'set', { paramKey });
  return base;
}

/**
 * Set voice for one language. Clears that language's media_url (voice truly changed
 * → old cached audio is stale). Other languages are untouched.
 */
export function buildNextNarratorWithVoiceChange(
  prev: NarratorSettings | null,
  langCode: string,
  voiceId: string,
): NarratorSettings {
  if (!NARRATOR_LANGUAGE_KEY_REGEX.test(langCode)) {
    log.warn('buildNextNarratorWithVoiceChange', 'invalid langCode', { langCode });
  }
  const base: NarratorSettings = prev ? { ...prev } : { ...DEFAULT_NARRATOR };
  const nextEntry: NarratorLanguageEntry = { voice_id: voiceId, media_url: null };
  (base as NarratorSettings)[langCode] = nextEntry;
  log.debug('buildNextNarratorWithVoiceChange', 'voice updated', {
    langCode,
    voiceId,
  });
  return base;
}

/**
 * Persist media_url after preview render succeeds. Preserves voice_id; if no prior
 * entry exists this is a no-op that logs a warning (upstream should have set voice first).
 */
export function buildNextNarratorWithMediaUrl(
  prev: NarratorSettings | null,
  langCode: string,
  mediaUrl: string,
): NarratorSettings {
  if (!NARRATOR_LANGUAGE_KEY_REGEX.test(langCode)) {
    log.warn('buildNextNarratorWithMediaUrl', 'invalid langCode', { langCode });
  }
  const base: NarratorSettings = prev ? { ...prev } : { ...DEFAULT_NARRATOR };
  const existing = base[langCode];
  const voiceId =
    existing && typeof existing === 'object'
      ? (existing as NarratorLanguageEntry).voice_id
      : '';
  if (!voiceId) {
    log.warn('buildNextNarratorWithMediaUrl', 'no prior voice_id for lang', {
      langCode,
    });
  }
  const nextEntry: NarratorLanguageEntry = { voice_id: voiceId, media_url: mediaUrl };
  (base as NarratorSettings)[langCode] = nextEntry;
  log.debug('buildNextNarratorWithMediaUrl', 'media_url set', { langCode });
  return base;
}
