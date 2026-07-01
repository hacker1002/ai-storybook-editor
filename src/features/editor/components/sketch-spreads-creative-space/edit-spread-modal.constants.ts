// edit-spread-modal.constants.ts — label + two-column layout for the 13 art-direction
// fields. Labels are display names (≠ the ArtDirection keys, e.g. `action`→"Character").
// Kept separate so the modal component stays focused on draft/commit logic.

import type { ArtDirection, SketchPageType } from '@/types/sketch';

// Display label per art-direction key. Note some labels intentionally diverge from the
// field key (action→"Character", layers→"Layer") — the key is the storage identity.
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

// Two-column render order for the field grid (left column, right column).
export const AD_FIELD_LAYOUT: [(keyof ArtDirection)[], (keyof ArtDirection)[]] = [
  ['stage', 'composition', 'action', 'light_color', 'animation', 'layers', 'negative_space'],
  ['camera', 'setting', 'space_time', 'art_concept', 'sound', 'interactive_intent'],
];

// All 13 keys — used to seed missing draft fields and diff draft↔store on save.
export const AD_KEYS = Object.keys(AD_LABELS) as (keyof ArtDirection)[];

// Tab / heading label per page type.
export const PAGE_LABELS: Record<SketchPageType, string> = {
  left: 'Left page',
  right: 'Right page',
  full: 'Full spread',
};
