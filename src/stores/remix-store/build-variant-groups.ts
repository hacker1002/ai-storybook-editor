// build-variant-groups.ts — Pure helper. Buckets an entity's `crop_sheets[]`
// by `variant_key` and returns `RemixVariantGroup[]` ordered by the entity's
// designer-defined `rawVariants[]`. Orphan sheets (variant_key invalid/null
// for a non-mix entity) are skipped with a defensive warn — engine layer is
// responsible for fallback (`base` write) before persist.
//
// Used by selector layer (Phase 02 — `useRemixEntities`) to project the
// `variants` field on `RemixEntityRef`. Memo-friendly: same input refs →
// same output ref (no React deps required because callers pass raw arrays
// straight from the remix snapshot row).
//
// Spec: ai-storybook-design/component/stores/remix-store.md §2

import { createLogger } from '@/utils/logger';
import type { RemixCropSheet, RemixVariantGroup } from '@/types/remix';

const log = createLogger('Store', 'BuildVariantGroups');

/** Minimal variant shape consumed by the helper — both `CharacterVariant` and
 *  `PropVariant` satisfy this duck-type. We avoid importing the concrete types
 *  so this module stays decoupled from snapshot domain. */
export interface VariantLike {
  key: string;
  name?: string;
  /** Per-variant identity-anchor image (`RemixCharacterVariant.visual_swap_url`).
   *  Surfaced onto the group as `visualSwapUrl` so the modal can gate `[⇄]` on
   *  every in-scope variant being non-null. `null`/absent until Generated. */
  visual_swap_url?: string | null;
}

/** Minimal entity shape consumed by the helper. */
export interface EntityLike {
  type: 'character' | 'prop' | 'mix';
  key: string;
  crop_sheets: RemixCropSheet[];
}

/**
 * Builds variant-group projection for a remix entity.
 *
 * @param entity Remix entity (character/prop/mix) with `crop_sheets[]`.
 * @param rawVariants Designer-defined variant list from snapshot (NOT persisted
 *   on `RemixEntityRef` per validation session 1). `null` for mix entity.
 * @returns Empty array for mix or when `rawVariants === null`; otherwise one
 *   group per raw variant that has ≥1 matching sheet, ordered by `rawVariants`.
 */
export function buildVariantGroups(
  entity: EntityLike,
  rawVariants: VariantLike[] | null,
): RemixVariantGroup[] {
  if (entity.type === 'mix' || rawVariants === null) {
    return [];
  }

  // Index raw variants by key for O(1) orphan check.
  const variantByKey = new Map<string, VariantLike>();
  for (const v of rawVariants) {
    variantByKey.set(v.key, v);
  }

  // Bucket sheet indices by `sheet.variant_key`. Orphans (null/unknown key)
  // are dropped with a single warn per occurrence.
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < entity.crop_sheets.length; i++) {
    const sheet = entity.crop_sheets[i];
    const vKey = sheet.variant_key;
    if (vKey === null || !variantByKey.has(vKey)) {
      log.warn(
        'buildVariantGroups',
        'orphan sheet (variant_key invalid or null) — skip',
        { entityKey: entity.key, sheetIndex: i, vKey },
      );
      continue;
    }
    const existing = buckets.get(vKey);
    if (existing) {
      existing.push(i);
    } else {
      buckets.set(vKey, [i]);
    }
  }

  // Iterate in raw-variant order (designer-defined) → groups output is stable
  // across renders so long as `rawVariants` ref is stable.
  const groups: RemixVariantGroup[] = [];
  for (const v of rawVariants) {
    const sheetIndices = buckets.get(v.key);
    if (sheetIndices && sheetIndices.length > 0) {
      groups.push({
        variantKey: v.key,
        name: v.name ?? v.key,
        sheetIndices,
        visualSwapUrl: v.visual_swap_url ?? null,
      });
    }
  }

  return groups;
}

export default buildVariantGroups;
