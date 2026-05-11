// hit-test.ts — Pure hit-test core for ADR-029 smart hit-test (Objects space).
//
// Stateless functions:
//   - containmentRatio(small, large) → area(intersection) / area(small)
//   - pointInGeometry(point, geometry) → rotated-aware point-in-rect
//   - collectHitItems(spread, point, ctxMap, opts) → HitCandidate[]
//   - computeBestTarget(candidates) → smallest fully-contained leaf or topmost
//   - findCoveringItems(selected, items) → items with z > selected.z and containment ≥ threshold
//
// Purity: no React, no store, no logger. AABB-based intersection chosen over
// OBB per ADR-029 trade-off (sufficient for UX, false-positive only at extreme
// rotation × narrow aspect — accepted).

import type { BaseSpread, ItemType } from "@/types/spread-types";
import { HIT_TEST_CONTAINMENT_THRESHOLD } from "@/constants/spread-constants";
import {
  resolveEffectiveZIndex,
  type CompositeContext,
} from "@/features/editor/utils/composite-resolve-helpers";
import { resolveItemZIndex } from "./resolve-item-z-index";
import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";

// === Public types ===

export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export type HitCandidateType =
  | "image"
  | "video"
  | "shape"
  | "textbox"
  | "auto_pic"
  | "audio"
  | "auto_audio"
  | "quiz";

export interface HitCandidate {
  id: string;
  type: HitCandidateType;
  index: number;
  geometry: Geometry;
  zIndex: number;
}

export interface CollectHitOpts {
  preventEditRawItem?: boolean;
  editingItemId?: string | null;
  excludeIds?: ReadonlySet<string>;
  /** Active editor language. Textboxes nest geometry under `[langCode]` —
   *  hit-test must mirror the renderer (which uses `getTextboxContentForLanguage`)
   *  or textboxes are excluded from candidates entirely. */
  langCode?: string;
}

// === Internal helpers ===

interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Axis-aligned bounding box. Rotated geometries return the enclosing AABB of
 *  the rotated corners. */
function getAABB(geometry: Geometry): AABB {
  const rotation = geometry.rotation ?? 0;
  if (rotation === 0) {
    return {
      minX: geometry.x,
      minY: geometry.y,
      maxX: geometry.x + geometry.w,
      maxY: geometry.y + geometry.h,
    };
  }
  const cx = geometry.x + geometry.w / 2;
  const cy = geometry.y + geometry.h / 2;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: Array<{ x: number; y: number }> = [
    { x: geometry.x, y: geometry.y },
    { x: geometry.x + geometry.w, y: geometry.y },
    { x: geometry.x + geometry.w, y: geometry.y + geometry.h },
    { x: geometry.x, y: geometry.y + geometry.h },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const dx = c.x - cx;
    const dy = c.y - cy;
    const rx = cx + dx * cos - dy * sin;
    const ry = cy + dx * sin + dy * cos;
    if (rx < minX) minX = rx;
    if (ry < minY) minY = ry;
    if (rx > maxX) maxX = rx;
    if (ry > maxY) maxY = ry;
  }
  return { minX, minY, maxX, maxY };
}

/** Real geometry area (w * h). Used as containment-ratio denominator.
 *  Coerces non-positive dimensions to 0 so degenerate items skip override. */
function getArea(geometry: Geometry): number {
  if (geometry.w <= 0 || geometry.h <= 0) return 0;
  return geometry.w * geometry.h;
}

/** Intersection area of two AABBs (derived from each geometry's enclosing AABB). */
function aabbIntersectionArea(a: Geometry, b: Geometry): number {
  const aabbA = getAABB(a);
  const aabbB = getAABB(b);
  const interX = Math.max(
    0,
    Math.min(aabbA.maxX, aabbB.maxX) - Math.max(aabbA.minX, aabbB.minX),
  );
  const interY = Math.max(
    0,
    Math.min(aabbA.maxY, aabbB.maxY) - Math.max(aabbA.minY, aabbB.minY),
  );
  return interX * interY;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// === Public functions ===

/** Containment ratio = area(intersection of small ∩ large AABB) / area(small).
 *  Returns 0 for degenerate small geometry (w<=0 or h<=0). */
export function containmentRatio(small: Geometry, large: Geometry): number {
  const area = getArea(small);
  if (area === 0) return 0;
  const inter = aabbIntersectionArea(small, large);
  return clamp(inter / area, 0, 1);
}

/** Point-in-rect with rotation. Point is in canvas percent space, same as geometry. */
export function pointInGeometry(
  point: { x: number; y: number },
  geometry: Geometry,
): boolean {
  const rotation = geometry.rotation ?? 0;
  if (rotation === 0) {
    return (
      point.x >= geometry.x &&
      point.x <= geometry.x + geometry.w &&
      point.y >= geometry.y &&
      point.y <= geometry.y + geometry.h
    );
  }
  const cx = geometry.x + geometry.w / 2;
  const cy = geometry.y + geometry.h / 2;
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - cx;
  const dy = point.y - cy;
  const rx = cx + dx * cos - dy * sin;
  const ry = cy + dx * sin + dy * cos;
  return (
    rx >= geometry.x &&
    rx <= geometry.x + geometry.w &&
    ry >= geometry.y &&
    ry <= geometry.y + geometry.h
  );
}

/** Normalize a SpreadItem (any layer) to the shared Geometry interface.
 *  Returns null if the item has no Geometry (auto_audio/audio use 2D point — skip).
 *
 *  Textboxes nest geometry per-language (`textbox[langCode].geometry`). Pass
 *  `type === "textbox"` + `langCode` and we resolve through the same helper the
 *  renderer uses, otherwise the hit-test would silently exclude textboxes. */
function toGeometry(
  item: unknown,
  type?: HitCandidateType,
  langCode?: string,
): Geometry | null {
  if (!item || typeof item !== "object") return null;

  if (type === "textbox" && langCode) {
    const result = getTextboxContentForLanguage(
      item as Record<string, unknown>,
      langCode,
    );
    const g = result?.content?.geometry;
    if (!g) return null;
    return {
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      rotation: typeof g.rotation === "number" ? g.rotation : 0,
    };
  }

  const maybeGeom = (item as { geometry?: unknown }).geometry;
  if (!maybeGeom || typeof maybeGeom !== "object") return null;
  const g = maybeGeom as Partial<Geometry>;
  if (
    typeof g.x !== "number" ||
    typeof g.y !== "number" ||
    typeof g.w !== "number" ||
    typeof g.h !== "number"
  ) {
    // auto_audio / audio with 2D-only geometry → no AABB → skip from hit-test
    return null;
  }
  return {
    x: g.x,
    y: g.y,
    w: g.w,
    h: g.h,
    rotation: typeof g.rotation === "number" ? g.rotation : 0,
  };
}

interface ItemLayerEntry {
  type: HitCandidateType;
  itemType: ItemType;
  items: ReadonlyArray<{ id?: string; "z-index"?: number; editor_visible?: boolean } | null | undefined> | undefined;
}

function collectLayerEntries(spread: BaseSpread): ItemLayerEntry[] {
  return [
    { type: "image", itemType: "image", items: spread.images },
    { type: "video", itemType: "video", items: spread.videos },
    { type: "shape", itemType: "shape", items: spread.shapes },
    { type: "textbox", itemType: "textbox", items: spread.textboxes },
    { type: "auto_pic", itemType: "auto_pic", items: spread.auto_pics },
    { type: "audio", itemType: "audio", items: spread.audios },
    { type: "auto_audio", itemType: "auto_audio", items: spread.auto_audios },
    { type: "quiz", itemType: "quiz", items: spread.quizzes },
  ];
}

/** Collect every item whose geometry contains `point`, with effective z-index
 *  resolved through composite override. Skips items with `editor_visible === false`
 *  and the currently-edited item (so user can click through it). */
export function collectHitItems(
  spread: BaseSpread,
  point: { x: number; y: number },
  editorCompositeCtxMap: Map<string, CompositeContext>,
  opts: CollectHitOpts = {},
): HitCandidate[] {
  const candidates: HitCandidate[] = [];
  const excludeIds = opts.excludeIds;
  const editingId = opts.editingItemId ?? null;

  for (const entry of collectLayerEntries(spread)) {
    const items = entry.items;
    if (!items) continue;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (!item || typeof item !== "object") continue;
      const itemId = (item as { id?: string }).id;
      if (!itemId) continue;
      if ((item as { editor_visible?: boolean }).editor_visible === false) continue;
      if (editingId !== null && editingId === itemId) continue;
      if (excludeIds && excludeIds.has(itemId)) continue;

      const geometry = toGeometry(item, entry.type, opts.langCode);
      if (!geometry) continue;
      if (!pointInGeometry(point, geometry)) continue;

      const baseZ = resolveItemZIndex(entry.itemType, index, spread);
      const effZ = resolveEffectiveZIndex(
        { id: itemId, "z-index": baseZ },
        editorCompositeCtxMap,
      );
      candidates.push({
        id: itemId,
        type: entry.type,
        index,
        geometry,
        zIndex: effZ,
      });
    }
  }
  return candidates;
}

/** Pick the best target per ADR-029 §1:
 *    - Sort candidates by z DESC (tie-break: array order).
 *    - Find smallest fully-contained candidate (area < topmost, ratio ≥ threshold).
 *    - Else fall back to topmost.
 *    Transitive nesting (A ⊃ B ⊃ C) handled via "smallest area wins".
 */
export function computeBestTarget(
  candidates: HitCandidate[],
): HitCandidate | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const sorted = [...candidates].sort((a, b) => b.zIndex - a.zIndex);
  const topmost = sorted[0];
  const topmostArea = getArea(topmost.geometry);

  let bestContained: HitCandidate | null = null;
  let bestContainedArea = Infinity;

  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i];
    const cArea = getArea(c.geometry);
    if (cArea === 0) continue;
    if (cArea >= topmostArea) continue;
    const ratio = containmentRatio(c.geometry, topmost.geometry);
    if (ratio >= HIT_TEST_CONTAINMENT_THRESHOLD && cArea < bestContainedArea) {
      bestContained = c;
      bestContainedArea = cArea;
    }
  }

  return bestContained ?? topmost;
}

/** Items that fully cover `selected` (z higher, containment ratio ≥ threshold).
 *  Used by Phase 5 dim overlapping logic. */
export function findCoveringItems(
  selected: HitCandidate,
  items: ReadonlyArray<HitCandidate>,
): HitCandidate[] {
  const out: HitCandidate[] = [];
  for (const item of items) {
    if (item.id === selected.id) continue;
    if (item.zIndex <= selected.zIndex) continue;
    const ratio = containmentRatio(selected.geometry, item.geometry);
    if (ratio >= HIT_TEST_CONTAINMENT_THRESHOLD) {
      out.push(item);
    }
  }
  return out;
}

/** Enumerate every visible item on the spread as a HitCandidate (no point filter).
 *  Mirrors `collectHitItems` but skips the point-containment test. Used by Phase 5
 *  dim computation to feed `findCoveringItems`. */
export function enumerateAllHitCandidates(
  spread: BaseSpread,
  editorCompositeCtxMap: Map<string, CompositeContext>,
  langCode?: string,
): HitCandidate[] {
  const out: HitCandidate[] = [];
  for (const entry of collectLayerEntries(spread)) {
    const items = entry.items;
    if (!items) continue;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (!item || typeof item !== "object") continue;
      const itemId = (item as { id?: string }).id;
      if (!itemId) continue;
      if ((item as { editor_visible?: boolean }).editor_visible === false) continue;
      const geometry = toGeometry(item, entry.type, langCode);
      if (!geometry) continue;
      const baseZ = resolveItemZIndex(entry.itemType, index, spread);
      const effZ = resolveEffectiveZIndex(
        { id: itemId, "z-index": baseZ },
        editorCompositeCtxMap,
      );
      out.push({
        id: itemId,
        type: entry.type,
        index,
        geometry,
        zIndex: effZ,
      });
    }
  }
  return out;
}
