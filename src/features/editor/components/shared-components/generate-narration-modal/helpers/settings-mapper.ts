// settings-mapper.ts — Per-chunk inference defaults + mapping to the
// narrate-script API payload (ElevenLabs v3). Per DB-CHANGELOG §4
// (2026-04-28): `model`/`seed`/`speaker_boost` dropped; `style_exaggeration`
// renamed `exaggeration`.

import type { NarrateScriptSettings } from "@/apis/narrate-script-api";

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
  settings: ChunkInferenceParams
): NarrateScriptSettings {
  return {
    stability: settings.stability,
    similarityBoost: settings.similarity,
    style: settings.exaggeration,
    speed: settings.speed,
  };
}
