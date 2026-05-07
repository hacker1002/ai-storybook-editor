// composite-list-helpers.ts - Helpers for composite-aware sidebar list grouping
// Composite is an edition-aware wrapper around 2-3 image/auto_pic sub-items.
// Sidebar renders composite as a parent group row + indented variant children.

import type { BaseSpread } from "@/types/canvas-types";
import type { EditionTag } from "@/types/spread-types";

/** Display label shown on edition tag chips next to composite child rows. */
export const EDITION_LABEL: Record<EditionTag, string> = {
  classic: "Classic",
  dynamic: "Dynamic",
  interactive: "Interactive",
};

/** Sort order of edition slots (used to order children inside a composite group). */
export const EDITION_ORDER: Record<EditionTag, number> = {
  classic: 0,
  dynamic: 1,
  interactive: 2,
};

/** Map item id (image/auto_pic id) → composite parent + edition slots it occupies. */
export interface VariantOwnerInfo {
  compositeId: string;
  editions: EditionTag[];
}

/**
 * Build map: variantId → { compositeId, editions }.
 * Multiple variants under the same composite may share the same `id` (cross-edition reuse) —
 * we collect all editions for that id, while we currently enforce single-composite-per-id
 * via the slice (Phase 1) so `compositeId` is deterministic.
 */
export function buildVariantOwnerMap(
  spread: BaseSpread
): Map<string, VariantOwnerInfo> {
  const map = new Map<string, VariantOwnerInfo>();
  const composites = spread.composites ?? [];
  for (const composite of composites) {
    for (const variant of composite.variants) {
      const existing = map.get(variant.id);
      if (existing) {
        // Same id reused across editions inside same composite → just append edition.
        if (!existing.editions.includes(variant.edition)) {
          existing.editions.push(variant.edition);
        }
      } else {
        map.set(variant.id, {
          compositeId: composite.id,
          editions: [variant.edition],
        });
      }
    }
  }
  return map;
}

/** Sort key for a child row given its edition slots: min(EDITION_ORDER). */
export function minEditionOrder(editions: EditionTag[] | undefined): number {
  if (!editions || editions.length === 0) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const e of editions) {
    const ord = EDITION_ORDER[e];
    if (ord < min) min = ord;
  }
  return min;
}
