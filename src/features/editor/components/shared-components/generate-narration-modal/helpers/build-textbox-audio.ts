// build-textbox-audio.ts — Strip UI fields off ChunkDraft[] and assemble the
// persisted `TextboxAudio` payload. Rollup `is_sync` derived from chunks
// (DB-CHANGELOG 2026-04-29) — single source of truth, no separate state.

import type {
  TextboxAudio,
  TextboxAudioChunk,
  WordTiming,
} from '@/types/spread-types';
import type { ChunkDraft } from '../components/chunk-types';

/** Extract persisted-shape `TextboxAudioChunk` from a ChunkDraft (drop ui + client_id). */
function stripChunk(draft: ChunkDraft): TextboxAudioChunk {
  return {
    voice_id: draft.voice_id,
    script: draft.script,
    stability: draft.stability,
    similarity: draft.similarity,
    exaggeration: draft.exaggeration,
    speed: draft.speed,
    script_synced: draft.script_synced,
    params_synced: draft.params_synced,
    results: draft.results,
  };
}

export function buildTextboxAudio(
  chunks: ChunkDraft[],
  combinedAudioUrl: string | null,
  combinedWordTimings: WordTiming[],
  combinedSelectionDirty: boolean,
): TextboxAudio {
  // is_sync rolls up chunk flags AND a "selection diverged from combined" bit.
  // Re-selecting a prior result does not flip chunk flags (regen not needed)
  // but does invalidate the cached combined URL until user re-runs Combine.
  const chunksSynced =
    chunks.length > 0 &&
    chunks.every((c) => c.script_synced && c.params_synced);
  const is_sync = chunksSynced && !combinedSelectionDirty;
  return {
    is_sync,
    combined_audio_url: combinedAudioUrl,
    word_timings: combinedWordTimings,
    chunks: chunks.map(stripChunk),
  };
}
