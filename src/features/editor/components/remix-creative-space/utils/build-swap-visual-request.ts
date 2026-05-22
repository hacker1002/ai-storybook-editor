// build-swap-visual-request.ts — Pure resolver: turn a character draft entry +
// humans + snapshot characters into a SwapVisualCoreRequest, or a guard reason
// when prerequisites are missing.
//
// The `characterImageUrl` (base sheet, 3 angles) is resolved by the caller (see
// resolve-base-sheet-url.ts) and passed in — keeps this function pure + testable.
//
// Guards mirror API spec validation (03-swap-character-visual.md §Parameters):
// missing human / visual / converted_image / no enabled-with-description trait.

import type { Human, TraitType } from '@/types/human';
import type { Character } from '@/types/character-types';
import type { RemixCharacterChoice } from '@/types/remix';
import type { SwapVisualCoreRequest, SwapVisualTrait } from '@/apis/remix-swap-visual-api';

export type SwapGuardReason =
  | 'NO_CHARACTER_IMAGE'
  | 'NO_HUMAN'
  | 'NO_VISUAL'
  | 'NO_CONVERTED_IMAGE'
  | 'EMPTY_SWAP_TRAITS'
  | 'NO_SNAPSHOT_CHARACTER';

export type BuildSwapRequestResult =
  | { ok: true; request: SwapVisualCoreRequest }
  | { ok: false; reason: SwapGuardReason };

export function buildSwapVisualCoreRequest(
  charKey: string,
  entry: RemixCharacterChoice,
  characterImageUrl: string | null,
  humans: Record<string, Human>,
  snapshotChars: Character[],
  // Non-base variants reuse the BASE variant's swapped visual as the appearance
  // reference (Image #2) instead of the raw human-normalize image — this keeps
  // all variants visually consistent with the base swap. `null`/omitted → base
  // flow (uses `profile.convertedImage`). The human profile is still required
  // (swap_traits + human_description come from it verbatim per product decision).
  humanImageUrlOverride?: string | null,
): BuildSwapRequestResult {
  if (!characterImageUrl) return { ok: false, reason: 'NO_CHARACTER_IMAGE' };
  if (!entry.human_id) return { ok: false, reason: 'NO_HUMAN' };

  const human = humans[entry.human_id];
  if (!human) return { ok: false, reason: 'NO_HUMAN' };
  if (!entry.visual) return { ok: false, reason: 'NO_VISUAL' };

  const profile = human.visualProfiles.find((vp) => vp.name === entry.visual);
  if (!profile) return { ok: false, reason: 'NO_VISUAL' };
  // converted_image null → swap blocked (API Open Q5: caller decides). Required
  // even for the override path: the base swap was itself generated from it, so a
  // missing converted_image signals a broken human/visual selection.
  if (!profile.convertedImage) return { ok: false, reason: 'NO_CONVERTED_IMAGE' };

  // Only enabled traits whose human profile has a non-empty description (API Open
  // Q4: caller skips traits without description so the endpoint leaves them intact).
  const swap_traits: SwapVisualTrait[] = entry.traits
    .filter((t) => t.is_enabled)
    .map((t): { type: TraitType; description: string | null } => ({
      type: t.type,
      description: profile.traits.find((x) => x.type === t.type)?.description ?? null,
    }))
    .filter((t): t is SwapVisualTrait => typeof t.description === 'string' && t.description.length > 0);

  if (swap_traits.length < 1) return { ok: false, reason: 'EMPTY_SWAP_TRAITS' };

  const snapChar = snapshotChars.find((c) => c.key === charKey);
  if (!snapChar) return { ok: false, reason: 'NO_SNAPSHOT_CHARACTER' };

  // character_context appearance/visual_description come from the base variant
  // (type=0) — the same source the base sheet was generated from.
  const baseVariant =
    snapChar.variants.find((v) => v.type === 0) ?? snapChar.variants[0];

  // Base flow → human-normalize image; non-base → base variant's swapped visual.
  const human_image_url = humanImageUrlOverride ?? profile.convertedImage;

  return {
    ok: true,
    request: {
      character_image_url: characterImageUrl,
      human_image_url,
      human_description: human.description ?? '',
      swap_traits,
      character_context: {
        name: snapChar.name,
        basic_info: snapChar.basic_info,
        personality: snapChar.personality,
        appearance: baseVariant?.appearance ?? {},
        visual_description: baseVariant?.visual_description ?? '',
      },
    },
  };
}
