// resolve-effective-language.ts — Decide which language to render in Preview.
//
// Rules:
// - Original source (no active remix): always honor narrationLanguage as-is.
// - Active remix: pick narrationLanguage if it's in the remix's enabled list,
//   else fall back to the first enabled language. If the remix has no enabled
//   languages at all (degenerate config), return narrationLanguage unchanged.
//
// Note (Validation Session 1): parameter is `narrationLanguage` not
// `currentLanguage` — Preview reads AnimationPlaybackStore.narrationLanguage,
// not EditorSettingsStore.currentLanguage. Phase-04 wires this resolver into
// PreviewCreativeSpace AND writes the result back to setNarrationLanguage on
// transition (overriding spec §4.1's no-write-back rule).
//
// Reference: plans/260514-1145-preview-space-remix-source-switching/phase-01

import type { Remix } from '@/types/remix';

export function resolveEffectiveLanguage(
  activeRemix: Remix | null,
  narrationLanguage: string,
): string {
  if (activeRemix === null) return narrationLanguage;

  const enabledLangs = activeRemix.remix_config.languages
    .filter((l) => l.is_enabled)
    .map((l) => l.code);

  if (enabledLangs.length === 0) return narrationLanguage;
  if (enabledLangs.includes(narrationLanguage)) return narrationLanguage;
  return enabledLangs[0];
}
