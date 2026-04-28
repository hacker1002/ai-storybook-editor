// chunk-types.ts — Local types shared by NarrationChunkCard and its sub-components.
// `ChunkDraft` is the modal's working draft for a single chunk; Phase 04 owns
// the canonical definition + state hook. Phase 03 declares the minimum shape
// needed to type the dumb card. If Phase 04 needs to extend, it can re-declare
// (this file stays the import target inside the card subtree).

import type {
  TextboxAudioChunk,
  TextboxAudioResult,
} from '@/types/spread-types';
import type { Voice } from '@/types/voice';
import type { NarrateScriptErrorCode } from '@/apis/narrate-script-api';

/** Per-chunk UI ephemeral state held by the modal. */
export interface ChunkUiState {
  isExpanded: boolean;
  isAdvanceOpen: boolean;
  isGenerating: boolean;
  /** Last error from a Generate attempt; cleared on next request start. */
  error: { errorCode: NarrateScriptErrorCode } | null;
  /**
   * Monotonic token bumped on each successful Generate. Card watches this to
   * trigger one-shot autoplay. Never persisted (stripped by build-textbox-audio).
   */
  autoPlayToken?: number;
}

/** Modal-side draft of one chunk (data + UI). Persisted shape == `TextboxAudioChunk`. */
export interface ChunkDraft extends TextboxAudioChunk {
  /** Stable client id for keying React lists + playback bus IDs. */
  client_id: string;
  ui: ChunkUiState;
}

export type { TextboxAudioResult, Voice };

/** Voice picker option — narrator + character entries flattened by the modal. */
export interface VoiceOption {
  voice_id: string;
  voice_name: string;
  source_label: string;
  source_kind: 'narrator' | 'character';
  character_key?: string;
}

/** Per-chunk inference param shape (subset of NarratorInferenceParams,
 *  no model/speaker_boost — schema 2026-04-28 dropped those for textbox audio). */
export interface InferenceParams {
  speed: number;
  stability: number;
  similarity: number;
  exaggeration: number;
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type ChunkErrorCode =
  | 'voice_unset'
  | 'voice_deleted'
  | 'script_empty'
  | 'script_too_long';

export interface ChunkValidationError {
  field: 'voice' | 'script';
  code: ChunkErrorCode;
}

export interface ChunkValidation {
  ok: boolean;
  errors: ChunkValidationError[];
}
