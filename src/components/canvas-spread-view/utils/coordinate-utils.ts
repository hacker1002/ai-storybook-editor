// utils/coordinate-utils.ts - Coordinate conversion utilities

import type { Point, Geometry } from '../types';
import { CANVAS } from '../constants';

/**
 * Convert percentage to pixel value
 */
export function toPixel(percent: number, dimension: number): number {
  return (percent / 100) * dimension;
}

/**
 * Convert pixel to percentage value
 */
export function toPercent(pixel: number, dimension: number): number {
  return (pixel / dimension) * 100;
}

/**
 * Convert mouse event to canvas percentage coordinates (zoom-adjusted)
 */
export function mouseToCanvasPercent(
  event: MouseEvent | React.MouseEvent,
  canvasRect: DOMRect,
  zoomLevel: number
): Point {
  const zoomFactor = zoomLevel / 100;
  const x = ((event.clientX - canvasRect.left) / zoomFactor / canvasRect.width) * 100;
  const y = ((event.clientY - canvasRect.top) / zoomFactor / canvasRect.height) * 100;
  return { x, y };
}

/**
 * Calculate delta in percentage between two points
 */
export function calculateDelta(
  currentPos: Point,
  startPos: Point,
  canvasRect: DOMRect
): Point {
  return {
    x: ((currentPos.x - startPos.x) / canvasRect.width) * 100,
    y: ((currentPos.y - startPos.y) / canvasRect.height) * 100,
  };
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate scaled dimensions based on zoom level
 */
export function getScaledDimensions(zoomLevel: number): { width: number; height: number } {
  return {
    width: CANVAS.BASE_WIDTH * (zoomLevel / 100),
    height: CANVAS.BASE_HEIGHT * (zoomLevel / 100),
  };
}

/**
 * Convert item geometry (percentages) to screen coordinates (pixels)
 * Uses canvas rect to calculate absolute screen position
 *
 * This avoids getBoundingClientRect() calls during drag/resize for better performance
 */
export function geometryToScreenRect(
  geometry: Geometry,
  canvasRect: DOMRect
): DOMRect {
  const x = canvasRect.left + (geometry.x / 100) * canvasRect.width;
  const y = canvasRect.top + (geometry.y / 100) * canvasRect.height;
  const width = (geometry.w / 100) * canvasRect.width;
  const height = (geometry.h / 100) * canvasRect.height;

  return new DOMRect(x, y, width, height);
}
