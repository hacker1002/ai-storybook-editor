// parse-stages.constants.ts — column mapping for the stage Excel import (design 05 §4).
// ONE sheet (`Stages`), 3 text columns — stages have NO height (a present height column is
// skipped + warned once).

export const STAGE_IMPORT_SHEET = { sheet: 'Stages', keyColumn: 'stage' } as const;

export const COL = {
  REF: 'ref',
  VARIANT: 'variant',
  DESCRIPTION: 'description',
  VISUAL_DESIGN: 'visual_design',
  ART_LANGUAGE: 'art_language',
  /** NOT imported — stages have no height; presence → skip + warn (once). */
  HEIGHT: 'height',
} as const;

/** Whole-cell `@key/variant` (the `ref` column cross-check). */
export const REF_RE = /^@(?<key>[a-z0-9_]+)\/(?<variant>[a-z0-9_]+)$/;

/** Inline `@key/variant` mentions inside free-text fields. */
export const REF_IN_TEXT_RE = /@(?<key>[a-z0-9_]+)\/(?<variant>[a-z0-9_]+)/g;
