// trait-constants.ts — Canonical trait order + labels shared across humans
// (visual-profiles) and remix (character trait gating).
//
// Source of truth: design DB-CHANGELOG 2026-05-21 — unify trait order to a
// single canonical sequence across book.remix, remix_config, and
// humans.visual_profiles. traits[] are keyed by `type`, so this order is
// DISPLAY-ONLY: consumers render/sort by TRAIT_TYPES regardless of the order
// the API/DB returns. Type-only import of TraitType keeps this runtime-cycle-free.

import type { TraitType } from '@/types/human';

/** Canonical UI render order. Display-only — traits are keyed by `type`. */
export const TRAIT_TYPES: TraitType[] = ['face', 'facewear', 'hair', 'skin', 'outfit'];

/** Human-readable labels per trait type. */
export const TRAIT_LABELS: Record<TraitType, string> = {
  face: 'Face',
  facewear: 'Facewear',
  hair: 'Hair',
  skin: 'Skin',
  outfit: 'Outfit',
};
