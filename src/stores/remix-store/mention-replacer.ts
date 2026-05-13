// mention-replacer.ts — Pure regex helper that swaps `@key` mentions in a
// textbox content string with resolved names.
//
// Resolution chain (Validation Session 1):
//   1. humans[character.human_id].displayName[currentLanguage]
//   2. humans[character.human_id].sourceName
//   3. remix.characters[key].name (cloned snapshot value)

import type { Human } from '@/types/human';
import type { RemixCharacterChoice } from '@/types/remix';

/** Build resolved name map keyed by character.key — single pass before regex. */
export function buildNameResolution(
  configCharacters: RemixCharacterChoice[],
  charactersFallback: Map<string, string>,
  humans: Map<string, Human>,
  currentLanguage: string,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of configCharacters) {
    if (!c.is_enabled) continue;
    let resolved: string | undefined;
    if (c.human_id) {
      const h = humans.get(c.human_id);
      if (h) {
        resolved = h.displayName?.[currentLanguage] || h.sourceName || undefined;
      }
    }
    out.set(c.key, resolved ?? charactersFallback.get(c.key) ?? c.key);
  }
  return out;
}

/** Replace `@key` tokens with resolved names. Idempotent — re-running over
 *  already-swapped text is a no-op (no `@` prefix remains). */
export function replaceMentions(
  text: string,
  resolution: Map<string, string>,
): string {
  if (!text) return text;
  return text.replace(/@(\w+)/g, (full, key: string) =>
    resolution.get(key) ?? full,
  );
}
