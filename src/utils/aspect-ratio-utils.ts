// aspect-ratio-utils.ts
// Shared helpers for aspect ratio computations. Single source of truth for
// ratio lookup, closest-match, geometry re-fit, and image dimension reading.

import {
  ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  type AspectRatio,
} from '@/constants/aspect-ratio-constants';

/** Numeric value (w/h) for a given AspectRatio label. Falls back to 1 if unknown. */
export function parseRatioNumeric(ratio: AspectRatio): number {
  return ASPECT_RATIOS.find((r) => r.value === ratio)?.numeric ?? 1;
}

/** Percent-space ratio: ratio in pixel-space scaled by image's natural aspect. */
export function getPercentRatio(
  ratio: AspectRatio,
  naturalW: number,
  naturalH: number,
): number {
  return parseRatioNumeric(ratio) * (naturalH / naturalW);
}

/** Closest supported ratio for a given width/height. Always returns a valid AspectRatio. */
export function findClosestRatio(width: number, height: number): AspectRatio {
  if (width <= 0 || height <= 0) return DEFAULT_ASPECT_RATIO;
  const srcRatio = width / height;
  let closest: AspectRatio = DEFAULT_ASPECT_RATIO;
  let minDiff = Infinity;
  for (const r of ASPECT_RATIOS) {
    const diff = Math.abs(r.numeric - srcRatio);
    if (diff < minDiff) {
      minDiff = diff;
      closest = r.value;
    }
  }
  return closest;
}

/**
 * Detect which AspectRatio an item's geometry currently represents, given the
 * canvas aspect ratio. Returns undefined if no preset is within the tolerance.
 */
export function detectRatioFromGeometry(
  geometryW: number,
  geometryH: number,
  canvasAspectRatio: number,
  tolerance = 0.05,
): AspectRatio | undefined {
  if (geometryW <= 0 || geometryH <= 0) return undefined;
  const ratio = (geometryW / geometryH) * canvasAspectRatio;
  return ASPECT_RATIOS.find((r) => Math.abs(r.numeric - ratio) < tolerance)?.value;
}

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ClampFn = (field: 'x' | 'y' | 'w' | 'h', value: number) => number;

/**
 * Recompute geometry to match a target ratio, preserving approximate area and
 * keeping the center pinned. Callers provide their own clamp fn (toolbar
 * clampGeometry) to keep value-range semantics consistent.
 */
export function calculateGeometryForRatio(
  geometry: Geometry,
  ratio: AspectRatio,
  canvasAspectRatio: number,
  clampGeometry: ClampFn,
): Geometry {
  const targetRatio = parseRatioNumeric(ratio) / canvasAspectRatio;
  const area = geometry.w * geometry.h;
  const newW = Math.sqrt(area * targetRatio);
  const newH = newW / targetRatio;

  const clampedW = clampGeometry('w', newW);
  const clampedH = clampGeometry('h', newH);

  const centerX = geometry.x + geometry.w / 2;
  const centerY = geometry.y + geometry.h / 2;
  const newX = clampGeometry('x', centerX - clampedW / 2);
  const newY = clampGeometry('y', centerY - clampedH / 2);

  return { x: newX, y: newY, w: clampedW, h: clampedH };
}

/** Read an image file's natural dimensions via an in-memory <img>. */
export function getImageNaturalDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to read image dimensions'));
    };
    img.src = url;
  });
}
