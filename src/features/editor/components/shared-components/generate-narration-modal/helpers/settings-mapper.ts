// settings-mapper.ts — Per-chunk inference defaults + mapping to the
// narrate-script API payload (ElevenLabs v3). Per DB-CHANGELOG §4
// (2026-04-28): `model`/`seed`/`speaker_boost` dropped; `style_exaggeration`
// renamed `exaggeration`.

import type { NarrateScriptSettings } from '@/apis/narrate-script-api';
import {
  DEFAULT_CHUNK_INFERENCE_PARAMS,
  NARRATION_OUTPUT_FORMAT,
} from '@/types/textbox-audio-adapter';

/** Backward-compat alias used by upload flow + modal seed. */
export const DEFAULT_SETTINGS = DEFAULT_CHUNK_INFERENCE_PARAMS;

/** Speed buttons shown in the modal. Spec drops 1.5x. */
export const SPEED_OPTIONS = [0.75, 1.0, 1.25] as const;

/** Only output format supported by the modal generate flow. */
export const OUTPUT_FORMAT = NARRATION_OUTPUT_FORMAT;

/** Server enforces script length post-resolve; client surfaces early. */
export const MAX_SCRIPT_LENGTH = 3000;

export interface ChunkInferenceParams {
  stability: number;
  similarity: number;
  exaggeration: number;
  speed: number;
}

/**
 * Map per-chunk inference params → NarrateScriptSettings (ElevenLabs API).
 * - `similarity` → `similarityBoost`
 * - `exaggeration` → `style`
 */
export function mapSettingsToApiPayload(
  settings: ChunkInferenceParams,
): NarrateScriptSettings {
  return {
    stability: settings.stability,
    similarityBoost: settings.similarity,
    style: settings.exaggeration,
    speed: settings.speed,
  };
}
