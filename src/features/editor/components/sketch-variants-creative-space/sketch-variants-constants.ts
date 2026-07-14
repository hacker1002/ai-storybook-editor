// sketch-variants-constants.ts — kind mapping + per-kind labels for the shared
// SketchVariantsCreativeSpace (one component parameterized by SketchEntityKind).
// Exported separately so editor-page routing (Phase 04) can map space id → kind.

import type { SketchEntityKind } from '@/types/sketch';
import type { SketchSpace } from '@/types/editor';
import type { ResourceType } from '@/stores/resource-lock-store';

/** Entity-kind sketch space(s) still routed through the shared
 *  SketchVariantsCreativeSpace. Redesign 2026-07-13: base/variant/lineup became
 *  FUNCTIONAL spaces (routed elsewhere) and `sketch-spread` is the storyboard space,
 *  so only `sketch-stage` remains here (kept per user — stages unchanged). */
export type SketchEntitySpaceId = Extract<SketchSpace, 'sketch-stage'>;

export const SPACE_TO_KIND: Record<SketchEntitySpaceId, SketchEntityKind> = {
  'sketch-stage': 'stages',
};

export interface KindConfig {
  /** Plural label (sidebar header / content heading). */
  title: string;
  /** Singular noun for toasts/messages. */
  noun: string;
  /** Excel sheet name read on import. */
  sheetName: string;
  /** Excel key column read on import. */
  keyColumn: string;
}

export const KIND_CONFIG: Record<SketchEntityKind, KindConfig> = {
  characters: { title: 'Characters', noun: 'character', sheetName: 'Characters', keyColumn: 'character' },
  props: { title: 'Props', noun: 'prop', sheetName: 'Props', keyColumn: 'prop' },
  stages: { title: 'Stages', noun: 'stage', sheetName: 'Stages', keyColumn: 'stage' },
};

/** Entity kind → `resource_locks.resource_type` (edit-lock addressing).
 *  3 character · 4 prop · 5 stage (image=1 · textbox=2 · spread=6 live elsewhere). */
export const KIND_TO_RESOURCE_TYPE: Record<SketchEntityKind, ResourceType> = {
  characters: 3,
  props: 4,
  stages: 5,
};

/** Display name derived from a thin entity key (entities carry no `name`):
 *  `kid_hero` → `Kid Hero`. */
export function titleCase(key: string): string {
  return key
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
