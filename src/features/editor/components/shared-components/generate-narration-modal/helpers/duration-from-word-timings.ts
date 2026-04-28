// duration-from-word-timings.ts — Derive a chunk-result duration from its
// word_timings array (last word's `endMs` ≈ total length). Falls back to 0
// when timings are absent or malformed.

import type { TextboxAudioResult } from '@/types/spread-types';

/** Returns duration in seconds (rounded to nearest int). 0 when not derivable. */
export function durationSecondsFromWordTimings(result: TextboxAudioResult): number {
  const wt = result.word_timings;
  if (!Array.isArray(wt) || wt.length === 0) return 0;
  const last = wt[wt.length - 1];
  if (!last || typeof last.endMs !== 'number' || !Number.isFinite(last.endMs)) {
    return 0;
  }
  return Math.max(0, Math.round(last.endMs / 1000));
}

/** Format seconds as `m:ss`. */
export function formatDurationMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
