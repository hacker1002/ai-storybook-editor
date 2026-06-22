// extract-box-geometry-utils.ts — Pure, React-free geometry helpers for the Objects-tab
// box overlay (design 03-objects-tab.md §4.2/§4.3). Extracted from crop-image-modal drag/
// resize/ratio math (crop-image-modal.tsx L218-349) so the overlay can reuse the proven
// logic WITHOUT touching the running crop-modal (isolation — Validation Session 1). Adds a
// `'Free'` branch (lockRatio = null → independent w/h resize) which the crop-modal lacks.
//
// All geometry is in PERCENT (0-100) of the source image area, matching ObjectBox + crop-
// object-image. `lockRatio` is a PERCENT-space ratio (newW / newH) — convert from an
// AspectRatio via `lockRatioForRatio` (uses image natural aspect). No DOM / React here.

import { findClosestRatio, getPercentRatio } from '@/utils/aspect-ratio-utils';
import type { AspectRatio } from '@/constants/aspect-ratio-constants';
import type { ObjectRatio } from './extract-image-modal-constants';

/** Top-left + size box geometry in % (0-100). */
export interface BoxGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

/** Clamp `value` into `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Client-pixel pointer delta → percent of the image-area rect (relative to image bounds). */
export function pointerDeltaToPercent(
  dxClient: number,
  dyClient: number,
  rectWidth: number,
  rectHeight: number,
): { dxPct: number; dyPct: number } {
  return {
    dxPct: rectWidth > 0 ? (dxClient / rectWidth) * 100 : 0,
    dyPct: rectHeight > 0 ? (dyClient / rectHeight) * 100 : 0,
  };
}

/** Percent-space lock ratio for a box's `ObjectRatio`. `'Free'` → null (no aspect lock). */
export function lockRatioForRatio(
  ratio: ObjectRatio,
  natural: { w: number; h: number } | null,
): number | null {
  if (ratio === 'Free' || !natural || natural.w <= 0 || natural.h <= 0) return null;
  return getPercentRatio(ratio, natural.w, natural.h);
}

/** Move a box by a percent delta, clamped so it stays fully inside [0,100]. */
export function applyDrag(start: BoxGeometry, dxPct: number, dyPct: number): BoxGeometry {
  return {
    x: clamp(start.x + dxPct, 0, 100 - start.w),
    y: clamp(start.y + dyPct, 0, 100 - start.h),
    w: start.w,
    h: start.h,
  };
}

/**
 * Resize a box from a corner. `lockRatio` null → Free (independent w/h, both deltas used);
 * non-null → aspect-locked (width-driven, height derived — mirrors crop-modal). Returns the
 * unchanged `start` geometry when the result would fall below `minSize` on either axis.
 */
export function applyResize(
  start: BoxGeometry,
  corner: ResizeCorner,
  dxPct: number,
  dyPct: number,
  lockRatio: number | null,
  minSize: number,
): BoxGeometry {
  const signX = corner.includes('e') ? 1 : -1;

  if (lockRatio == null) {
    // Free: width + height move independently with their respective deltas.
    const signY = corner.includes('s') ? 1 : -1;
    let newW = Math.max(minSize, start.w + signX * dxPct);
    let newH = Math.max(minSize, start.h + signY * dyPct);
    let newX = corner.includes('w') ? start.x + start.w - newW : start.x;
    let newY = corner.includes('n') ? start.y + start.h - newH : start.y;

    if (newX < 0) { newW += newX; newX = 0; }
    if (newY < 0) { newH += newY; newY = 0; }
    if (newX + newW > 100) newW = 100 - newX;
    if (newY + newH > 100) newH = 100 - newY;
    if (newW < minSize || newH < minSize) return { ...start };
    return { x: newX, y: newY, w: newW, h: newH };
  }

  // Locked: keep aspect (pr = lockRatio = w/h). Width-driven, height derived.
  const pr = lockRatio;
  let newW = Math.max(minSize, start.w + signX * dxPct);
  let newH = newW / pr;
  if (newH > 100) { newH = 100; newW = newH * pr; }
  if (newW > 100) { newW = 100; newH = newW / pr; }

  let newX = corner.includes('w') ? start.x + start.w - newW : start.x;
  let newY = corner.includes('n') ? start.y + start.h - newH : start.y;

  if (newX < 0) { newW += newX; newX = 0; newH = newW / pr; }
  if (newY < 0) { newH += newY; newY = 0; newW = newH * pr; }
  if (newX + newW > 100) { newW = 100 - newX; newH = newW / pr; }
  if (newY + newH > 100) { newH = 100 - newY; newW = newH * pr; }
  if (newW < minSize || newH < minSize) return { ...start };
  return { x: newX, y: newY, w: newW, h: newH };
}

/**
 * Snap a box to an aspect lock (`lockRatio` = percent-space w/h), preserving area and pinning
 * the center, then clamping into bounds. Mirrors crop-modal `handleRatioChange`. For Free
 * boxes the caller skips this (no aspect to snap to).
 */
export function snapBoxToRatio(box: BoxGeometry, lockRatio: number, minSize: number): BoxGeometry {
  const pr = lockRatio;
  const area = box.w * box.h;
  let newW = Math.sqrt(area * pr);
  newW = clamp(newW, minSize, 100);
  let newH = newW / pr;
  if (newH > 100) { newH = 100; newW = newH * pr; }
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return {
    x: clamp(cx - newW / 2, 0, 100 - newW),
    y: clamp(cy - newH / 2, 0, 100 - newH),
    w: newW,
    h: newH,
  };
}

/** Nearest allowed AspectRatio for a percent box given the image's natural dims (pixel-space). */
export function nearestAllowedRatio(
  w: number,
  h: number,
  natural: { w: number; h: number } | null,
): AspectRatio {
  if (!natural || natural.w <= 0 || natural.h <= 0) return findClosestRatio(w, h);
  return findClosestRatio(w * natural.w, h * natural.h);
}

/** Convert a detect-objects geometry (basis 10000) to percent (0-100) — 07 §Notes. */
export function basisGeometryToPercent(g: BoxGeometry): BoxGeometry {
  return { x: g.x / 100, y: g.y / 100, w: g.w / 100, h: g.h / 100 };
}

/** Split an array into chunks of at most `size` (used to cap crop-object-image at ≤3/call). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
