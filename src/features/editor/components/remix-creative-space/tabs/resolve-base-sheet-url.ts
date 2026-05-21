// resolve-base-sheet-url.ts — Resolve the base sheet image (3-angle
// FRONT/BACK/SIDE) for a snapshot character. This is the `character_image_url`
// fed to /api/remix/swap-character-visual (the original character art that the
// human appearance is swapped onto).
//
// Source: base variant (type=0) → selected illustration (fallback first).
// CharacterVariant has no direct URL field — the rendered sheet lives in
// `illustrations[]` (illustration-generate-character-base output).

import type { Character } from '@/types/character-types';

export function resolveBaseSheetUrl(
  charKey: string,
  snapshotChars: Character[],
): string | null {
  const char = snapshotChars.find((c) => c.key === charKey);
  if (!char) return null;
  const baseVariant =
    char.variants.find((v) => v.type === 0) ?? char.variants[0];
  if (!baseVariant) return null;
  const illustrations = baseVariant.illustrations ?? [];
  const selected = illustrations.find((i) => i.is_selected);
  return selected?.media_url ?? illustrations[0]?.media_url ?? null;
}
