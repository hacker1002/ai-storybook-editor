// utils/geometry-utils.ts - Geometry calculation utilities

import type { Geometry, ResizeHandle } from '@/types/canvas-types';
import { CANVAS } from '@/constants/spread-constants';
import { clamp } from './coordinate-utils';

// Items may drag/resize outside trim box into bleed+staging. Soft bounds allow
// up to ±50% of trim width/height beyond the trim edge on any side — ensures
// user retains spatial anchoring (≥50% spread visible at max scroll extent).
const OVERFLOW_MAX = 50;
const SIZE_MAX = 300;

/**
 * Check if geometry is on left page (center point < 50%)
 */
export function isOnLeftPage(geometry: Geometry): boolean {
  return geometry.x + geometry.w / 2 < 50;
}

/**
 * Check if geometry is on right page (center point >= 50%)
 */
export function isOnRightPage(geometry: Geometry): boolean {
  return geometry.x + geometry.w / 2 >= 50;
}

/**
 * Get page position from geometry
 */
export function getPagePosition(geometry: Geometry): 'left' | 'right' {
  return isOnLeftPage(geometry) ? 'left' : 'right';
}

/**
 * Apply drag delta to geometry with relaxed bounds.
 * Items may move into bleed+staging area (±OVERFLOW_MAX beyond trim edges).
 */
export function applyDragDelta(
  geometry: Geometry,
  deltaX: number,
  deltaY: number
): Geometry {
  return {
    ...geometry,
    x: clamp(geometry.x + deltaX, -OVERFLOW_MAX, 100 - geometry.w + OVERFLOW_MAX),
    y: clamp(geometry.y + deltaY, -OVERFLOW_MAX, 100 - geometry.h + OVERFLOW_MAX),
  };
}

/**
 * Apply resize delta to geometry based on handle.
 * Note: react-moveable's dist represents size change magnitude (always positive when expanding),
 * not raw mouse movement. For n/w handles, we negate delta to move origin correctly.
 */
export function applyResizeDelta(
  geometry: Geometry,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number
): Geometry {
  let { x, y, w, h } = geometry;
  const minSize = CANVAS.MIN_ELEMENT_SIZE;

  // West handles: expanding left means x decreases, w increases
  if (handle.includes('w')) {
    const newX = clamp(x - deltaX, -OVERFLOW_MAX, x + w - minSize);
    w = w + (x - newX);
    x = newX;
  } else if (handle.includes('e')) {
    w = clamp(w + deltaX, minSize, SIZE_MAX);
  }

  // North handles: expanding up means y decreases, h increases
  if (handle.includes('n')) {
    const newY = clamp(y - deltaY, -OVERFLOW_MAX, y + h - minSize);
    h = h + (y - newY);
    y = newY;
  } else if (handle.includes('s')) {
    h = clamp(h + deltaY, minSize, SIZE_MAX);
  }

  return { x, y, w, h };
}

/**
 * Apply nudge to geometry based on direction
 */
export function applyNudge(
  geometry: Geometry,
  direction: 'up' | 'down' | 'left' | 'right',
  step: number
): Geometry {
  const delta = { x: 0, y: 0 };

  switch (direction) {
    case 'up': delta.y = -step; break;
    case 'down': delta.y = step; break;
    case 'left': delta.x = -step; break;
    case 'right': delta.x = step; break;
  }

  return applyDragDelta(geometry, delta.x, delta.y);
}

/**
 * Aspect-ratio-locked resize. Computes new geometry from original + delta + handle,
 * keeping the opposite edge anchored and ratio maintained even at canvas bounds.
 *
 * Unlike applyResizeDelta + post-hoc ratio fix, this avoids position drift
 * for w/n handles where x/y depends on the final w/h.
 */
export function applyAspectLockedResize(
  original: Geometry,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  aspect: number
): Geometry {
  const minSize = CANVAS.MIN_ELEMENT_SIZE;
  const { x, y, w, h } = original;
  const anchorRight = x + w;
  const anchorBottom = y + h;

  let newW: number, newH: number;

  // Determine new size: edge handles use their axis, corners use dominant delta
  if (handle === 'e' || handle === 'w') {
    newW = w + deltaX;
    newH = newW / aspect;
  } else if (handle === 'n' || handle === 's') {
    newH = h + deltaY;
    newW = newH * aspect;
  } else {
    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      newW = w + deltaX;
      newH = newW / aspect;
    } else {
      newH = h + deltaY;
      newW = newH * aspect;
    }
  }

  // Enforce minimum size while keeping ratio
  if (newW < minSize) {
    newW = minSize;
    newH = minSize / aspect;
  }
  if (newH < minSize) {
    newH = minSize;
    newW = minSize * aspect;
  }

  // Position: anchor the opposite edge
  let newX = handle.includes('w') ? anchorRight - newW : x;
  let newY = handle.includes('n') ? anchorBottom - newH : y;

  // Clamp to soft bounds — allow items beyond trim box into bleed+staging
  if (newX < -OVERFLOW_MAX) {
    newX = -OVERFLOW_MAX;
    newW = anchorRight - newX;
    newH = newW / aspect;
    if (handle.includes('n')) newY = anchorBottom - newH;
  }
  if (newY < -OVERFLOW_MAX) {
    newY = -OVERFLOW_MAX;
    newH = anchorBottom - newY;
    newW = newH * aspect;
    if (handle.includes('w')) newX = anchorRight - newW;
  }
  if (newW > SIZE_MAX) {
    newW = SIZE_MAX;
    newH = newW / aspect;
    if (handle.includes('w')) newX = anchorRight - newW;
    if (handle.includes('n')) newY = anchorBottom - newH;
  }
  if (newH > SIZE_MAX) {
    newH = SIZE_MAX;
    newW = newH * aspect;
    if (handle.includes('w')) newX = anchorRight - newW;
    if (handle.includes('n')) newY = anchorBottom - newH;
  }

  return { x: newX, y: newY, w: newW, h: newH };
}

/**
 * Check if geometry is within bounds
 */
export function isWithinBounds(geometry: Geometry): boolean {
  return (
    geometry.x >= 0 &&
    geometry.y >= 0 &&
    geometry.x + geometry.w <= 100 &&
    geometry.y + geometry.h <= 100
  );
}
