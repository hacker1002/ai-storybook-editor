// parse-base-entities.constants.ts — Mapping + column constants for the BASE-space Excel
// import (design sketch-base-creative-space/05-import-base-entities.md). Differs from the
// legacy single-column variants import (parse-sketch-entities.constants.ts):
//   • reads TWO sheets in one pass (Characters + Props — base space merges both kinds),
//   • FOUR text columns mapped 1:1 (description / height / visual_design / art_language),
//   • NO media_url (imagery is populated on generate, never imported),
//   • NO Stages sheet (the stage space is separate, untouched).

import type { BaseKind } from '@/types/sketch';

/** Which sheet + key column to read per base kind. keyColumn is lowercase to match the
 *  normalized (lowercased) header lookup done in the parser. */
export const IMPORT_SHEETS: { kind: BaseKind; sheet: string; keyColumn: string }[] = [
  { kind: 'characters', sheet: 'Characters', keyColumn: 'character' },
  { kind: 'props', sheet: 'Props', keyColumn: 'prop' },
];

/** Non-key column names (lowercased — header lookup is case/space-insensitive). Each maps to
 *  its OWN variant field; `description` is NOT collapsed into `visual_design` (design-03 §72). */
export const COL = {
  REF: 'ref',
  VARIANT: 'variant',
  DESCRIPTION: 'description',
  HEIGHT: 'height',
  VISUAL_DESIGN: 'visual_design',
  ART_LANGUAGE: 'art_language',
} as const;

/** Whole-cell `@key/variant` (the `ref` column = a row's own canonical identity).
 *  Case-insensitive so capitalized Excel keys still parse (keys are kept verbatim). */
export const REF_RE = /^@(?<key>[a-z0-9_]+)\/(?<variant>[a-z0-9_]+)$/i;

/** Inline `@key/variant` occurrences inside any free-text field (global, unanchored). */
export const REF_IN_TEXT_RE = /@(?<key>[a-z0-9_]+)\/(?<variant>[a-z0-9_]+)/gi;
