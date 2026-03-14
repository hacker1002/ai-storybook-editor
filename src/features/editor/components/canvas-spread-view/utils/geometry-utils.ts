// utils/geometry-utils.ts - Geometry calculation utilities

import type { Geometry, ResizeHandle } from '../types';
import { CANVAS } from '../constants';
import { clamp } from './coordinate-utils';

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
 * Apply drag delta to geometry with bounds checking
 */
export function applyDragDelta(
  geometry: Geometry,
  deltaX: number,
  deltaY: number
): Geometry {
  return {
    ...geometry,
    x: clamp(geometry.x + deltaX, 0, 100 - geometry.w),
    y: clamp(geometry.y + deltaY, 0, 100 - geometry.h),
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
    const newX = clamp(x - deltaX, 0, x + w - minSize);
    w = w + (x - newX);
    x = newX;
  } else if (handle.includes('e')) {
    w = clamp(w + deltaX, minSize, 100 - x);
  }

  // North handles: expanding up means y decreases, h increases
  if (handle.includes('n')) {
    const newY = clamp(y - deltaY, 0, y + h - minSize);
    h = h + (y - newY);
    y = newY;
  } else if (handle.includes('s')) {
    h = clamp(h + deltaY, minSize, 100 - y);
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
