// signature.ts — Deterministic in-memory signature for dirty detection.
// This is NOT equivalent to the server `meta.pathKey` hash; it only tells
// whether the local editable script/settings differ from the last generated
// snapshot. The server pathKey remains the source of truth for backend
// caching. Validation Session 1 dropped client-side SHA256 hashing.

import type { TextboxAudioSettings } from '@/types/spread-types';

// ASCII unit separator — avoids collision with script content.
const SEP = '\x1F';

/**
 * Build a stable string encoding script + settings. Same input always yields
 * the same string. Decimal fields use fixed precision to avoid float jitter
 * (e.g. 0.7500001 vs 0.75).
 */
export function signatureOf(
  script: string,
  settings: TextboxAudioSettings,
): string {
  const settingsPart = [
    settings.model,
    settings.stability.toFixed(3),
    settings.similarity.toFixed(3),
    settings.style_exaggeration.toFixed(3),
    settings.speed.toFixed(3),
    settings.speaker_boost ? '1' : '0',
    settings.seed ?? 'null',
  ].join('|');
  return script + SEP + settingsPart;
}
