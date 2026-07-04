// edit-spread-modal.constants.ts — label + single-column order for the art-direction
// fields. Labels are display names (≠ the ArtDirection keys, e.g. `action`→"Character").
// Kept separate so the modal component stays focused on draft/commit logic.

import type { ArtDirection, SketchPageType } from '@/types/sketch';

// Display label per art-direction key. Note some labels intentionally diverge from the
// field key (action→"Character", layers→"Layer") — the key is the storage identity.
// Kept as a FULL record (all keys) so label lookups stay non-nullable even for keys the
// editor no longer renders (e.g. space_time). Rendered set is driven by AD_FIELD_ORDER.
export const AD_LABELS: Record<keyof ArtDirection, string> = {
  stage: 'Stage',
  composition: 'Composition',
  action: 'Character',
  light_color: 'Light & color',
  animation: 'Animation',
  layers: 'Layer',
  negative_space: 'Negative space',
  camera: 'Camera',
  setting: 'Setting',
  space_time: 'Space & time',
  art_concept: 'Art concept',
  sound: 'Sound',
  interactive_intent: 'Interactive intent',
};

// Single-column render order — one field per row (reading order of the old 2-col grid).
// `space_time` is intentionally OMITTED (field removed from the editor 2026-07-04); its
// stored value is preserved untouched because AD_KEYS drives the save-diff and the store
// update merges patches — a key absent from the patch is never overwritten.
export const AD_FIELD_ORDER: (keyof ArtDirection)[] = [
  'stage',
  'camera',
  'composition',
  'setting',
  'action',
  'light_color',
  'art_concept',
  'animation',
  'sound',
  'layers',
  'interactive_intent',
  'negative_space',
];

// Keys seeded into the draft and diffed on save — the rendered fields only (no space_time).
export const AD_KEYS = AD_FIELD_ORDER;

// Tab / heading label per page type.
export const PAGE_LABELS: Record<SketchPageType, string> = {
  left: 'Left page',
  right: 'Right page',
  full: 'Full spread',
};
