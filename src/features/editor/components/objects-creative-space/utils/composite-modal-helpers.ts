// composite-modal-helpers.ts - Pure helpers for CreateCompositeModal
// Logic per phase-03 plan: candidates building, edition slot pool, default name, z-index.

import { LAYER_CONFIG } from "@/constants/spread-constants";
import type { BaseSpread } from "@/types/canvas-types";
import type {
  CompositeVariant,
  CompositeVariantSourceType,
  EditionTag,
  SpreadComposite,
} from "@/types/spread-types";

/** Display row for one image / auto_pic candidate in the modal list. */
export interface CompositeCandidate {
  id: string;
  type: CompositeVariantSourceType;
  title: string;
  zIndex: number;
}

/** Map (item id) → editions selected for that sub-item in the modal draft. */
export type CompositeSelections = Record<string, EditionTag[]>;

/** Edition priority order for auto-assign (classic → dynamic → interactive). */
export const EDITION_PRIORITY: EditionTag[] = ["classic", "dynamic", "interactive"];

/**
 * Build candidate list = image + auto_pic on this spread NOT already in a composite.
 * Sorted by z-index DESC (top-of-layer first, matching sidebar order).
 */
export function buildCandidates(
  spread: BaseSpread | undefined
): CompositeCandidate[] {
  if (!spread) return [];

  // Set of variant ids already claimed by an existing composite.
  const taken = new Set<string>();
  for (const c of spread.composites ?? []) {
    for (const v of c.variants) taken.add(v.id);
  }

  const result: CompositeCandidate[] = [];
  for (const img of spread.images ?? []) {
    if (taken.has(img.id)) continue;
    result.push({
      id: img.id,
      type: "image",
      title: img.title ?? img.name ?? "Untitled image",
      zIndex: img["z-index"] ?? 0,
    });
  }
  for (const ap of spread.auto_pics ?? []) {
    if (taken.has(ap.id)) continue;
    result.push({
      id: ap.id,
      type: "auto_pic",
      title: ap.title ?? ap.name ?? "Untitled auto_pic",
      zIndex: ap["z-index"] ?? 0,
    });
  }

  // Highest z-index first (matches sidebar's top-down ordering).
  result.sort((a, b) => b.zIndex - a.zIndex);
  return result;
}

/**
 * Editions already claimed by OTHER rows in the draft (for slot-pool conflict).
 * A row's own editions are NOT considered taken (the row "owns" them).
 */
export function getDisabledEditionsForRow(
  itemId: string,
  selections: CompositeSelections
): Set<EditionTag> {
  const taken = new Set<EditionTag>();
  for (const [otherId, eds] of Object.entries(selections)) {
    if (otherId === itemId) continue;
    for (const e of eds) taken.add(e);
  }
  return taken;
}

/**
 * Row is disabled when not yet checked AND all 3 edition slots are claimed by
 * other rows. Already-checked rows stay enabled so the user can edit them.
 */
export function isRowDisabled(
  itemId: string,
  selections: CompositeSelections
): boolean {
  const isAlreadyChecked = (selections[itemId]?.length ?? 0) > 0;
  if (isAlreadyChecked) return false;
  return getDisabledEditionsForRow(itemId, selections).size === EDITION_PRIORITY.length;
}

/**
 * First edition not yet claimed by other rows (priority classic → dynamic → interactive).
 * Returns null when slot pool is exhausted.
 */
export function suggestInitialEdition(
  itemId: string,
  selections: CompositeSelections
): EditionTag | null {
  const taken = getDisabledEditionsForRow(itemId, selections);
  for (const e of EDITION_PRIORITY) {
    if (!taken.has(e)) return e;
  }
  return null;
}

/**
 * Expand draft selections into the flat variant array stored on SpreadComposite.
 * 1 entry per (itemId, edition) pair. Order: by candidate order × edition priority.
 */
export function expandToVariants(
  selections: CompositeSelections,
  candidates: CompositeCandidate[]
): CompositeVariant[] {
  const variants: CompositeVariant[] = [];
  for (const candidate of candidates) {
    const eds = selections[candidate.id];
    if (!eds || eds.length === 0) continue;
    // Stable edition order within a row.
    const sorted = [...eds].sort(
      (a, b) => EDITION_PRIORITY.indexOf(a) - EDITION_PRIORITY.indexOf(b)
    );
    for (const e of sorted) {
      variants.push({ id: candidate.id, type: candidate.type, edition: e });
    }
  }
  return variants;
}

/**
 * "group N" where N = max(existing N) + 1, or 1 when no group-named composites exist.
 * Parses regex `^group (\d+)$` (case-insensitive). Falls back to 1 on parse error.
 */
export function nextDefaultName(
  composites: SpreadComposite[] | undefined
): string {
  if (!composites || composites.length === 0) return "group 1";
  const re = /^group (\d+)$/i;
  let max = 0;
  for (const c of composites) {
    const m = re.exec(c.title?.trim() ?? "");
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `group ${max + 1}`;
}

/**
 * z-index for new composite: max(MEDIA layer occupants) + 1, clamped to MEDIA.max.
 * Matches handleAddElement convention in objects-sidebar.tsx.
 */
export function nextZIndex(spread: BaseSpread | undefined): number {
  const layer = LAYER_CONFIG.MEDIA;
  if (!spread) return layer.min;

  const zs: number[] = [];
  for (const img of spread.images ?? []) {
    if (img["z-index"] !== undefined) zs.push(img["z-index"]);
  }
  for (const v of spread.videos ?? []) {
    if (v["z-index"] !== undefined) zs.push(v["z-index"]);
  }
  for (const ap of spread.auto_pics ?? []) {
    zs.push(ap["z-index"] ?? 0);
  }
  for (const c of spread.composites ?? []) {
    zs.push(c["z-index"] ?? 0);
  }

  if (zs.length === 0) return layer.min;
  const maxZ = Math.max(...zs);
  return Math.min(maxZ + 1, layer.max);
}
