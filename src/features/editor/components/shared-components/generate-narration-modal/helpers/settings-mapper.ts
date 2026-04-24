// settings-mapper.ts — TextboxAudioSettings defaults + mapping to the
// narrate-script API payload (ElevenLabs v3). Key renames happen here; callers
// should not need to know server field names.

import type { TextboxAudioSettings } from '@/types/spread-types';
import type { NarrateScriptSettings } from '@/apis/narrate-script-api';

export const DEFAULT_SETTINGS: TextboxAudioSettings = {
  model: 'eleven_v3',
  stability: 0.5,
  similarity: 0.75,
  style_exaggeration: 0,
  speed: 1.0,
  speaker_boost: true,
  seed: null,
};

/** Speed buttons shown in the modal. Spec drops 1.5x. */
export const SPEED_OPTIONS = [0.75, 1.0, 1.25] as const;

/** Only output format supported by the modal (spec §4.3). */
export const OUTPUT_FORMAT = 'mp3_44100_128' as const;

/** Server enforces 2000 characters post-resolve; client surfaces early. */
export const MAX_SCRIPT_LENGTH = 2000;

/**
 * Map TextboxAudioSettings → NarrateScriptSettings.
 * - `similarity` → `similarityBoost`
 * - `style_exaggeration` → `style`
 * - `speaker_boost` omitted (ElevenLabs v3 does not support it)
 * - `seed` null → omit the field entirely
 */
export function mapSettingsToApiPayload(
  settings: TextboxAudioSettings,
): NarrateScriptSettings {
  const payload: NarrateScriptSettings = {
    stability: settings.stability,
    similarityBoost: settings.similarity,
    style: settings.style_exaggeration,
    speed: settings.speed,
  };
  if (settings.seed != null) {
    payload.seed = settings.seed;
  }
  return payload;
}
