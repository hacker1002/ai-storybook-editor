// textbox-audio-adapter.ts — Read-time adapter + defaults for the new
// chunks-based TextboxAudio shape (DB-CHANGELOG §4 2026-04-28).
//
// Migration note: the old shape `{ script, settings, media }` is intentionally
// NOT migrated. Adapter returns `null` for any non-conforming input so the
// modal seeds a fresh chunk. Accepted data loss documented per phase plan;
// users must regenerate narration. Server-side migration (if any) is owned
// by the DB team.

import { createLogger } from '@/utils/logger';
import type {
  TextboxAudio,
  TextboxAudioChunk,
} from './spread-types';

const log = createLogger('TextboxAudioAdapter', 'Coerce');

/** Default per-chunk inference parameters. Values per spec. */
export const DEFAULT_CHUNK_INFERENCE_PARAMS = {
  stability: 0.5,
  similarity: 0.75,
  exaggeration: 0,
  speed: 1.0,
} as const;

/** Hard cap on a single chunk script length (server-enforced). */
export const SCRIPT_MAX_CHARS = 3000;

/** Only output format used by the modal generate flow. */
export const NARRATION_OUTPUT_FORMAT = 'mp3_44100_128' as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object';
}

/**
 * Coerce arbitrary persisted snapshot data into a valid `TextboxAudio` or
 * null. New shape passes through (deep clone). Anything else (legacy shape,
 * malformed, null, primitive) → null + warn log.
 */
export function coerceTextboxAudio(raw: unknown): TextboxAudio | null {
  if (!isObject(raw)) {
    return null;
  }
  const hasChunksArr = Array.isArray((raw as { chunks?: unknown }).chunks);
  const hasScriptSyncedBool =
    typeof (raw as { script_synced?: unknown }).script_synced === 'boolean';
  if (!hasChunksArr || !hasScriptSyncedBool) {
    log.warn('coerceTextboxAudio', 'legacy or malformed shape — dropping', {
      keys: Object.keys(raw),
    });
    return null;
  }
  // Defensive deep clone so callers can mutate without touching snapshot.
  return structuredClone(raw) as unknown as TextboxAudio;
}

/** Build an empty chunk seeded with default inference + the given script. */
export function buildEmptyChunk(
  voiceId: string,
  script: string,
): TextboxAudioChunk {
  return {
    voice_id: voiceId,
    script,
    ...DEFAULT_CHUNK_INFERENCE_PARAMS,
    script_synced: false,
    results: [],
  };
}

/** Build a fresh `TextboxAudio` shell with one default chunk. */
export function buildEmptyTextboxAudio(
  voiceId: string,
  script: string,
): TextboxAudio {
  return {
    script_synced: false,
    combined_audio_url: null,
    word_timings: [],
    chunks: [buildEmptyChunk(voiceId, script)],
  };
}
