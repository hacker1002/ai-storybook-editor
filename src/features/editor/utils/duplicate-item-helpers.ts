// duplicate-item-helpers.ts — Shared pure helpers for the duplicate-item feature.
// Used by SpreadsMainView and ObjectsMainView handleDuplicateItem handlers.

import {
  calculateZIndexShifts,
  collectPictorialZItems,
  collectMixZItems,
  collectTextZItems,
  type ZIndexShift,
} from "./z-index-cascade-utils";

/** Minimal geometry shape required for offset calculation */
interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Z-index tier that a duplicable item belongs to */
export type DuplicateZTier = "pictorial" | "mix" | "text";

/** Spread shape needed for cascade collection (superset of all tier item arrays) */
interface SpreadForCascade {
  images?: Array<{ id: string; "z-index"?: number }>;
  videos?: Array<{ id: string; "z-index": number }>;
  shapes?: Array<{ id: string; "z-index"?: number }>;
  audios?: Array<{ id: string; "z-index": number }>;
  quizzes?: Array<{ id: string; "z-index": number }>;
  textboxes?: Array<{ id: string; "z-index"?: number }>;
}

/** Result of cascade computation for a single duplicate operation */
export interface DuplicateZShiftResult {
  /** z-index to assign to the cloned item */
  newZ: number;
  /** shifts to apply to existing items in the same tier */
  shifts: ZIndexShift[];
}

/**
 * Offset geometry by +2% X/Y, clamped so the clone stays fully within the canvas.
 * Formula: clamp(pos + 2, 0, 100 - dimension)
 */
export function duplicateGeometry(source: Geometry): Geometry {
  return {
    ...source,
    x: Math.max(0, Math.min(source.x + 2, 100 - source.w)),
    y: Math.max(0, Math.min(source.y + 2, 100 - source.h)),
  };
}

/**
 * Deep-clone an item, assign a new UUID, and offset its geometry (if present).
 * Uses native structuredClone (Chrome 98+, Safari 15.4+, Firefox 94+).
 */
export function cloneItemWithNewId<T extends { id: string; geometry?: Geometry }>(
  source: T
): T {
  const clone = structuredClone(source);
  clone.id = crypto.randomUUID();
  if (clone.geometry) {
    clone.geometry = duplicateGeometry(clone.geometry);
  }
  return clone;
}

/**
 * Apply +2% offset to all language-content geometries inside a textbox.
 * SpreadTextbox stores geometry nested per-language (e.g. textbox.vi.geometry),
 * so the generic cloneItemWithNewId top-level shift doesn't apply.
 *
 * Mutates the textbox in place. Each language entry is shifted independently,
 * with clamping per its own width/height.
 */
export function shiftTextboxLanguageGeometries(
  textbox: Record<string, unknown>
): void {
  for (const key of Object.keys(textbox)) {
    const value = textbox[key];
    if (
      value &&
      typeof value === "object" &&
      "geometry" in value &&
      (value as { geometry?: unknown }).geometry &&
      typeof (value as { geometry: unknown }).geometry === "object"
    ) {
      const content = value as { geometry: Geometry };
      content.geometry = duplicateGeometry(content.geometry);
    }
  }
}

/**
 * Compute z-index cascade for a duplicate operation (insertCount = 1).
 *
 * The clone takes `sourceZ + 1`. Any existing items in the same tier with
 * `z > sourceZ` that would collide get shifted upward via `calculateZIndexShifts`.
 *
 * Pure function — callers apply the returned shifts via appropriate store update
 * actions (shape/audio/quiz all live in the mix tier → caller must dispatch to
 * the correct action per shift id via type detection on the spread).
 *
 * @param spread   - the spread containing source + neighbors
 * @param sourceId - id of the item being duplicated (excluded from cascade)
 * @param sourceZ  - z-index of the source item
 * @param tier     - which tier to cascade within
 */
export function computeDuplicateZShift(
  spread: SpreadForCascade,
  sourceId: string,
  sourceZ: number,
  tier: DuplicateZTier
): DuplicateZShiftResult {
  let tierItems;
  if (tier === "pictorial") {
    tierItems = collectPictorialZItems(
      { images: spread.images ?? [], videos: spread.videos },
      sourceId
    );
  } else if (tier === "mix") {
    tierItems = collectMixZItems(
      { shapes: spread.shapes, audios: spread.audios, quizzes: spread.quizzes },
      sourceId
    );
  } else {
    tierItems = collectTextZItems(
      { textboxes: spread.textboxes ?? [] },
      sourceId
    );
  }

  const shifts = calculateZIndexShifts(sourceZ, 1, tierItems);
  return { newZ: sourceZ + 1, shifts };
}
