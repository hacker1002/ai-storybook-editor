// build-textbox-audio.ts — Strip UI fields off ChunkDraft[] and assemble the
// persisted `TextboxAudio` payload. `audioScriptSynced` is the persisted flag
// owned by the modal — never derived here.

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
    results: draft.results,
  };
}

export function buildTextboxAudio(
  chunks: ChunkDraft[],
  combinedAudioUrl: string | null,
  combinedWordTimings: WordTiming[],
  audioScriptSynced: boolean,
): TextboxAudio {
  return {
    script_synced: audioScriptSynced,
    combined_audio_url: combinedAudioUrl,
    word_timings: combinedWordTimings,
    chunks: chunks.map(stripChunk),
  };
}
