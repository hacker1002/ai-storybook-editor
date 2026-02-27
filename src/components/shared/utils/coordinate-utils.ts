// coordinate-utils.ts - Coordinate conversion utilities shared across spread views

import type { Point, Geometry } from '../types';
import { CANVAS } from '../constants';

export function toPixel(percent: number, dimension: number): number {
  return (percent / 100) * dimension;
}

export function toPercent(pixel: number, dimension: number): number {
  return (pixel / dimension) * 100;
}

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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getScaledDimensions(zoomLevel: number): { width: number; height: number } {
  return {
    width: CANVAS.BASE_WIDTH * (zoomLevel / 100),
    height: CANVAS.BASE_HEIGHT * (zoomLevel / 100),
  };
}

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
