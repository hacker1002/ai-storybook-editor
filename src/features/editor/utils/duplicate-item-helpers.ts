// duplicate-item-helpers.ts — Shared pure helpers for the duplicate-item feature.
// Used by SpreadsMainView and ObjectsMainView handleDuplicateItem, handleCropCreateImages,
// handleSplitCreateImages handlers.

import { LAYER_CONFIG } from "@/constants/spread-constants";
import { createLogger } from "@/utils/logger";

const log = createLogger("Util", "DuplicateItemHelpers");

// === Types ===

/** Minimal geometry shape required for offset calculation */
interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Z-index tier that a duplicable item belongs to */
export type DuplicateZTier = "pictorial" | "mix" | "text";

/** Spread shape needed for z-index tier collection (superset of all tier item arrays) */
export interface SpreadForCascade {
  images?: Array<{ id: string; "z-index"?: number }>;
  videos?: Array<{ id: string; "z-index": number }>;
  animated_pics?: Array<{ id: string; "z-index"?: number }>;
  shapes?: Array<{ id: string; "z-index"?: number }>;
  audios?: Array<{ id: string; "z-index": number }>;
  quizzes?: Array<{ id: string; "z-index": number }>;
  textboxes?: Array<{ id: string; "z-index"?: number }>;
}

// === Z-index helpers ===

/** Maps tier name to LAYER_CONFIG range */
const TIER_RANGE = {
  pictorial: LAYER_CONFIG.MEDIA,
  mix: LAYER_CONFIG.OBJECTS,
  text: LAYER_CONFIG.TEXT,
} as const satisfies Record<DuplicateZTier, { min: number; max: number }>;

/**
 * Returns the z-index that the first new item should receive so it sits above
 * all existing items in the given tier. Subsequent items (k=2..count) should
 * receive `firstZ + k - 1`.
 *
 * - If the tier is empty → returns tier.min.
 * - If `options.excludeId` is set → that item is excluded from the max scan
 *   (used when the original will be deleted after, e.g. crop with inpainted replace).
 * - If `count` items would exceed tier.max → clamps firstZ to tier.max and emits
 *   a warn log. Callers should clamp individual assignments defensively too.
 *
 * Pure function except for the warn log.
 */
export function nextTopZInTier(
  spread: SpreadForCascade,
  tier: DuplicateZTier,
  options?: { excludeId?: string; count?: number }
): number {
  const tierRange = TIER_RANGE[tier];
  const count = options?.count ?? 1;
  const ex = options?.excludeId;

  // Collect all z values in tier, excluding `ex`. Items without z-index fall back
  // to tierRange.min - 1 so they don't bias the max upward unexpectedly.
  const fallback = tierRange.min - 1;
  const pushZ = (id: string, z: number | undefined, acc: number[]) => {
    if (id !== ex) acc.push(z ?? fallback);
  };

  const zValues: number[] = [];
  if (tier === "pictorial") {
    for (const img of spread.images ?? []) pushZ(img.id, img["z-index"], zValues);
    for (const vid of spread.videos ?? []) pushZ(vid.id, vid["z-index"], zValues);
    for (const ap of spread.animated_pics ?? []) pushZ(ap.id, ap["z-index"], zValues);
  } else if (tier === "mix") {
    for (const shape of spread.shapes ?? []) pushZ(shape.id, shape["z-index"], zValues);
    for (const audio of spread.audios ?? []) pushZ(audio.id, audio["z-index"], zValues);
    for (const quiz of spread.quizzes ?? []) pushZ(quiz.id, quiz["z-index"], zValues);
  } else {
    for (const tb of spread.textboxes ?? []) pushZ(tb.id, tb["z-index"], zValues);
  }

  if (zValues.length === 0) return tierRange.min;

  const maxZ = Math.max(...zValues);
  const firstZ = maxZ + 1;
  const lastZ = maxZ + count;

  if (lastZ > tierRange.max) {
    log.warn("nextTopZInTier", "ceiling hit — clamping", {
      tier,
      maxZ,
      count,
      clampedAt: tierRange.max,
    });
    return Math.min(firstZ, tierRange.max);
  }

  return firstZ;
}

// === Geometry helpers ===

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
