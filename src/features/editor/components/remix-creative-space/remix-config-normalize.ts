// remix-config-normalize.ts — WYSIWYG trait normalization for the create-remix
// config modal (product call 2026-06-10).
//
// PROBLEM: the modal seeds every trait `is_enabled: true` and only DISPLAY-masks
// the checkbox (`checked = is_enabled ∧ bookGate ∧ profileSupported`), so the
// persisted remix_config could claim traits the user never saw checked (e.g. a
// trait the picked visual profile has no description for). Downstream readers
// (swap-config review modal, backend sprite_swap_resolver) then over-report.
//
// FIX (two layers):
//   1. On human/visual change the traits RESET to the maximum checkable set
//      for that profile (`maxTraitChoicesFor`) — product call 2026-06-10:
//      prior ticks are intentionally discarded, the default is "everything
//      this profile can swap".
//   2. Save still normalizes (`normalizeRemixConfigTraits`) as the WYSIWYG
//      safety net — persist exactly the displayed checkbox state.
//
// This module is the SINGLE SOURCE for the two display predicates (book gate +
// profile support) — CharacterSwapRow / CharactersTab import them, so display
// and persistence cannot drift apart.

import { TRAIT_TYPES } from '@/constants/trait-constants';
import type { Human, TraitType } from '@/types/human';
import type { RemixCharacterEntry } from '@/types/editor';
import type { RemixConfig, RemixTraitChoice } from '@/types/remix';

/** Book-level gate per trait — a trait the book disabled cannot be configured.
 *  Missing entry defaults to enabled (mirrors the DB reader rule). */
export function bookTraitGate(
  bookChar: RemixCharacterEntry | undefined,
  type: TraitType,
): boolean {
  return bookChar?.traits.find((t) => t.type === type)?.is_enabled ?? true;
}

/** Trait types the picked visual profile can configure = traits with a
 *  non-empty description. Null when no human/visual is picked yet (→ no
 *  masking, mirrors the create modal's display). */
export function supportedTraitSetFor(
  humans: Human[],
  humanId: string | null,
  visualName: string | null,
): Set<TraitType> | null {
  if (!humanId || !visualName) return null;
  const profile = humans
    .find((h) => h.id === humanId)
    ?.visualProfiles.find((vp) => vp.name === visualName);
  if (!profile) return null;
  return new Set(
    profile.traits
      .filter((t) => typeof t.description === 'string' && t.description.length > 0)
      .map((t) => t.type),
  );
}

/** Maximum checkable trait set for a (book character, profile) pair —
 *  `is_enabled = bookGate ∧ profileSupported`. Used to RESET traits whenever
 *  the human or visual changes (default = tick everything the profile can
 *  swap; prior user ticks are discarded by design). `supported = null` (no
 *  profile resolved) → only the book gate applies. */
export function maxTraitChoicesFor(
  bookChar: RemixCharacterEntry | undefined,
  supported: Set<TraitType> | null,
): RemixTraitChoice[] {
  return TRAIT_TYPES.map((type) => ({
    type,
    is_enabled:
      bookTraitGate(bookChar, type) && (supported ? supported.has(type) : true),
  }));
}

/** Collapse a draft RemixConfig to its DISPLAYED trait state (WYSIWYG):
 *  `is_enabled' = is_enabled ∧ bookGate ∧ profileSupported`. Pure — props /
 *  voices / languages pass through untouched. */
export function normalizeRemixConfigTraits(
  config: RemixConfig,
  bookChars: RemixCharacterEntry[],
  humans: Human[],
): RemixConfig {
  const bookByKey = new Map(bookChars.map((c) => [c.key, c]));
  return {
    ...config,
    characters: config.characters.map((entry) => {
      const bookChar = bookByKey.get(entry.key);
      const supported = supportedTraitSetFor(humans, entry.human_id, entry.visual);
      const traits: RemixTraitChoice[] = TRAIT_TYPES.map((type) => {
        // `?? false` mirrors the checkbox render (CharacterSwapRow), NOT the
        // DB-reader `?? true` — WYSIWYG persists what the user saw.
        const raw = entry.traits.find((t) => t.type === type)?.is_enabled ?? false;
        return {
          type,
          is_enabled:
            raw &&
            bookTraitGate(bookChar, type) &&
            (supported ? supported.has(type) : true),
        };
      });
      return { ...entry, traits };
    }),
  };
}
