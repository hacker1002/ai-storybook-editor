// spread-textbox-guards.ts — Type guards for SpreadTextbox dynamic-keyed content.

import type { SpreadTextboxContent } from '@/types/spread-types';

/** Narrow an unknown SpreadTextbox value (per-lang content or legacy field)
 *  to SpreadTextboxContent. Returns false for booleans/numbers/strings
 *  (e.g. `id`, `title`, `z-index`, `player_visible`). */
export function isTextboxContent(value: unknown): value is SpreadTextboxContent {
  return (
    !!value &&
    typeof value === 'object' &&
    'text' in (value as Record<string, unknown>) &&
    typeof (value as { text: unknown }).text === 'string'
  );
}
