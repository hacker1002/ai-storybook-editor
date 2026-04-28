// run-combine-chunks.ts — Pure orchestration for the on-demand combine flow.
// Extracted from use-narration-modal-state.ts to keep that file under the
// 500-LOC budget. Resolves selected results per chunk, then delegates to the
// combine-audio-chunks API. The 1-chunk shortcut is handled in the state hook
// (no API call needed).

import {
  callCombineAudioChunks,
  type CombineAudioChunksErrorCode,
} from '@/apis/combine-audio-chunks-api';
import type { WordTiming } from '@/types/spread-types';

import type { ChunkDraft } from '../components/chunk-types';

export interface CombineChunksSuccess {
  ok: true;
  audioUrl: string;
  words: WordTiming[];
}

export interface CombineChunksFailure {
  ok: false;
  reason: 'aborted' | 'api';
  errorCode?: CombineAudioChunksErrorCode;
}

export type CombineChunksOutcome =
  | CombineChunksSuccess
  | CombineChunksFailure;

export interface RunCombineChunksParams {
  chunks: ChunkDraft[];
  signal: AbortSignal;
}

/**
 * Build payload from selected results + call combine API. Caller must have
 * already verified `chunks.length >= 2` (use the 1-chunk shortcut otherwise).
 */
export async function runCombineChunks(
  params: RunCombineChunksParams,
): Promise<CombineChunksOutcome> {
  const { chunks, signal } = params;

  const payload = chunks.map((c) => {
    const sel = c.results.find((r) => r.is_selected);
    return {
      audioUrl: sel?.url ?? '',
      script: c.script,
      wordTimings: sel?.word_timings ?? [],
    };
  });

  try {
    const res = await callCombineAudioChunks(
      { chunks: payload },
      { signal },
    );
    if (!res.success) {
      return { ok: false, reason: 'api', errorCode: res.errorCode };
    }
    return {
      ok: true,
      audioUrl: res.data.audioUrl,
      words: res.data.words,
    };
  } catch {
    if (signal.aborted) return { ok: false, reason: 'aborted' };
    return { ok: false, reason: 'api', errorCode: 'UNKNOWN' };
  }
}
