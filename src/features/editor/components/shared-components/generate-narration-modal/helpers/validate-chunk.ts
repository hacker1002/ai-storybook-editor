// validate-chunk.ts — Pure validation for a single ChunkDraft.
// Generate button disabled when `!ok || isGenerating`.

import { SCRIPT_MAX_CHARS } from '@/types/textbox-audio-adapter';
import type {
  ChunkDraft,
  ChunkValidation,
  ChunkValidationError,
  Voice,
} from '../components/chunk-types';

export function validateChunk(
  chunk: ChunkDraft,
  voicesById: Map<string, Voice>,
): ChunkValidation {
  const errors: ChunkValidationError[] = [];

  // Voice checks
  if (!chunk.voice_id) {
    errors.push({ field: 'voice', code: 'voice_unset' });
  } else if (!voicesById.has(chunk.voice_id)) {
    errors.push({ field: 'voice', code: 'voice_deleted' });
  }

  // Script checks
  const trimmed = chunk.script.trim();
  if (trimmed.length === 0) {
    errors.push({ field: 'script', code: 'script_empty' });
  }
  if (chunk.script.length > SCRIPT_MAX_CHARS) {
    errors.push({ field: 'script', code: 'script_too_long' });
  }

  return { ok: errors.length === 0, errors };
}

/** True when chunk has at least one validation error of the given field. */
export function hasFieldError(
  validation: ChunkValidation,
  field: 'voice' | 'script',
): boolean {
  return validation.errors.some((e) => e.field === field);
}
