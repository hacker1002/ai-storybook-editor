// Mapping + column constants for sketch entity Excel import (design
// sketch-variants-creative-space/04-import-sketch-entities.md). One sheet per kind;
// thin projection (key + variants[{ key, description, visual_design, art_language }]).

import type { SketchEntityKind } from '@/types/sketch';

/** Which sheet + key column to read per entity kind. keyColumn is lowercase to match
 *  normalized (lowercased) header lookup. */
export const IMPORT_SHEET: Record<SketchEntityKind, { sheet: string; keyColumn: string }> = {
  characters: { sheet: 'Characters', keyColumn: 'character' },
  props: { sheet: 'Props', keyColumn: 'prop' },
  stages: { sheet: 'Stages', keyColumn: 'stage' },
};

/** Non-key column names (lowercased — header lookup is case/space-insensitive). */
export const COL = { REF: 'ref', VARIANT: 'variant', DESCRIPTION: 'description' } as const;

// Case-insensitive so capitalized Excel keys (e.g. `Kid`) still parse; ref resolution
// then compares case-insensitively (keys are kept verbatim, not mutated).
/** Whole-cell `@key/variant` (the `ref` column = a row's own canonical identity). */
export const REF_RE = /^@(?<key>[a-z0-9_]+)\/(?<variant>[a-z0-9_]+)$/i;

/** Inline `@key/variant` occurrences inside a free-text description (global, unanchored). */
export const REF_IN_TEXT_RE = /@(?<key>[a-z0-9_]+)\/(?<variant>[a-z0-9_]+)/gi;
