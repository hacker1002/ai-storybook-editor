// edit-spread-modal.constants.ts — label + single-column order for the art-direction
// fields. Labels are display names (≠ the ArtDirection keys, e.g. `action`→"Character").
// Kept separate so the modal component stays focused on draft/commit logic.

import type { ArtDirection, SketchPageType } from '@/types/sketch';

// Display label per art-direction key — matches the Storyboard template row labels.
// `action`→"Character" intentionally diverges from the field key (the row it comes from);
// the key is the storage identity. FULL record (all 7 keys) so lookups stay non-nullable.
export const AD_LABELS: Record<keyof ArtDirection, string> = {
  stage: 'Stage',
  camera: 'Camera',
  composition: 'Composition',
  setting: 'Setting',
  action: 'Character',
  light_tone: 'Light & tone',
  art_language: 'Art language',
};

// Single-column render order — one field per row, following the template row order.
// ALSO the list of keys seeded into the draft and diffed on save: render order and
// persisted keys are the same set (every field is rendered), so there is one list.
export const AD_FIELD_ORDER = [
  'stage',
  'camera',
  'composition',
  'setting',
  'action',
  'light_tone',
  'art_language',
] as const satisfies readonly (keyof ArtDirection)[];

// Compile-time exhaustiveness guard — errors naming the offending key as soon as an
// ArtDirection key is missing from AD_FIELD_ORDER. Without it a new field would silently
// never render, never seed and never diff, since a plain `(keyof ArtDirection)[]`
// annotation accepts any subset (extra/typo'd keys are caught by the `satisfies` above).
//
// The `as const` on AD_FIELD_ORDER is what makes this load-bearing: re-adding an explicit
// `(keyof ArtDirection)[]` annotation widens the element type back to the full key union,
// `Exclude` collapses to `never`, and the guard silently passes for ANY list. Don't.
type AssertNoMissingKey<T extends never> = T;
export type AdFieldOrderIsExhaustive = AssertNoMissingKey<
  Exclude<keyof ArtDirection, (typeof AD_FIELD_ORDER)[number]>
>;

// Tab / heading label per page type.
export const PAGE_LABELS: Record<SketchPageType, string> = {
  left: 'Left page',
  right: 'Right page',
  full: 'Full spread',
};
