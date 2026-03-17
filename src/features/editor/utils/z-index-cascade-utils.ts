// z-index-cascade-utils.ts - Cascade z-index adjustment when inserting items into a z-order range
//
// Used by split-image, duplicate, paste, and any operation that inserts N items
// at consecutive z-indices starting from a base. Items in the same z-tier that
// would collide are pushed upward, cascading only as far as necessary.

import { createLogger } from "@/utils/logger";

const log = createLogger("Util", "ZIndexCascade");

// === Types ===

/** Minimal z-index item for cascade calculation */
export interface ZIndexItem {
  id: string;
  z: number;
}

/** A z-index update to apply after cascade calculation */
export interface ZIndexShift {
  id: string;
  from: number;
  to: number;
}

// === Core ===

/**
 * Calculate which existing items need their z-index shifted to make room
 * for `insertCount` new items at consecutive z-indices starting from `baseZ + 1`.
 *
 * Only items with z > baseZ are considered. Items with enough natural gap
 * are left untouched — shifts only cascade where collisions exist.
 *
 * @param baseZ       - z-index of the reference item (e.g. the original image being split)
 * @param insertCount - number of new items to insert (they'll occupy baseZ+1 .. baseZ+insertCount)
 * @param itemsInTier - all existing items in the same z-tier (excluding the reference item)
 * @returns array of shifts to apply (may be empty if no collisions)
 *
 * @example
 *   // origZ=5, inserting 4 items → new at 6,7,8,9
 *   // existing items at z=7, z=10, z=12
 *   calculateZIndexShifts(5, 4, [
 *     { id: "a", z: 7 }, { id: "b", z: 10 }, { id: "c", z: 12 }
 *   ])
 *   // => [{ id: "a", from: 7, to: 10 }, { id: "b", from: 10, to: 11 }]
 *   // z=12 stays — no collision after shifts
 */
export function calculateZIndexShifts(
  baseZ: number,
  insertCount: number,
  itemsInTier: ZIndexItem[]
): ZIndexShift[] {
  const above = itemsInTier
    .filter((item) => item.z > baseZ)
    .sort((a, b) => a.z - b.z);

  if (above.length === 0) return [];

  const shifts: ZIndexShift[] = [];
  let minAllowedZ = baseZ + insertCount + 1;

  for (const item of above) {
    if (item.z < minAllowedZ) {
      shifts.push({ id: item.id, from: item.z, to: minAllowedZ });
      minAllowedZ = minAllowedZ + 1;
    } else {
      // No collision — update floor for next item
      minAllowedZ = item.z + 1;
    }
  }

  if (shifts.length > 0) {
    log.debug("calculateZIndexShifts", "shifts computed", {
      baseZ,
      insertCount,
      shiftCount: shifts.length,
    });
  }

  return shifts;
}

// === Helpers ===

/**
 * Collect z-index items from images and videos on a spread (pictorial tier).
 * Excludes item with `excludeId` (typically the source item being split).
 */
export function collectPictorialZItems(
  spread: {
    images: Array<{ id: string; "z-index"?: number }>;
    videos?: Array<{ id: string; "z-index": number }>;
  },
  excludeId?: string
): ZIndexItem[] {
  const items: ZIndexItem[] = [];
  for (const img of spread.images) {
    if (img.id !== excludeId) {
      items.push({ id: img.id, z: img["z-index"] ?? 0 });
    }
  }
  for (const vid of spread.videos ?? []) {
    if (vid.id !== excludeId) {
      items.push({ id: vid.id, z: vid["z-index"] });
    }
  }
  return items;
}

/**
 * Collect z-index items from shapes, audios, and quizzes on a spread (mix tier).
 * Excludes item with `excludeId`.
 */
export function collectMixZItems(
  spread: {
    shapes?: Array<{ id: string; "z-index"?: number }>;
    audios?: Array<{ id: string; "z-index": number }>;
    quizzes?: Array<{ id: string; "z-index": number }>;
  },
  excludeId?: string
): ZIndexItem[] {
  const items: ZIndexItem[] = [];
  for (const shape of spread.shapes ?? []) {
    if (shape.id !== excludeId) {
      items.push({ id: shape.id, z: shape["z-index"] ?? 0 });
    }
  }
  for (const audio of spread.audios ?? []) {
    if (audio.id !== excludeId) {
      items.push({ id: audio.id, z: audio["z-index"] });
    }
  }
  for (const quiz of spread.quizzes ?? []) {
    if (quiz.id !== excludeId) {
      items.push({ id: quiz.id, z: quiz["z-index"] });
    }
  }
  return items;
}

/**
 * Collect z-index items from textboxes on a spread (text tier).
 * Excludes item with `excludeId`.
 */
export function collectTextZItems(
  spread: {
    textboxes: Array<{ id: string; "z-index"?: number }>;
  },
  excludeId?: string
): ZIndexItem[] {
  const items: ZIndexItem[] = [];
  for (const tb of spread.textboxes) {
    if (tb.id !== excludeId) {
      items.push({ id: tb.id, z: tb["z-index"] ?? 0 });
    }
  }
  return items;
}
