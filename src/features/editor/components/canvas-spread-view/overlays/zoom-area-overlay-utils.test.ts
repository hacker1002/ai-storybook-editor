// zoom-area-overlay-utils.test.ts — Pure helper tests (geometry math, ratio lock).

import { describe, it, expect } from 'vitest';
import {
  ZOOM_OVERLAY,
  buildDefaultZoomGeometry,
  clampToBounds,
  computeMove,
  computeResize,
  drawRectFromPointers,
  enforceMinSize,
} from './zoom-area-overlay-utils';

describe('clampToBounds', () => {
  it('keeps geometry within [0, 100]', () => {
    expect(clampToBounds({ x: -10, y: -5, w: 50, h: 25 })).toEqual({ x: 0, y: 0, w: 50, h: 25 });
    expect(clampToBounds({ x: 80, y: 80, w: 30, h: 30 })).toEqual({ x: 70, y: 70, w: 30, h: 30 });
  });
});

describe('enforceMinSize', () => {
  // Aspect lock = SPREAD aspect → in percentage space (w/spreadW, h/spreadH),
  // that means w_pct = h_pct. spreadRatio param has no effect on the math.
  it('grows BOTH axes to MIN, keeping w_pct = h_pct', () => {
    const result = enforceMinSize({ x: 0, y: 0, w: 5, h: 2 }, 2);
    expect(result.w).toBeGreaterThanOrEqual(ZOOM_OVERLAY.MIN_ZOOM_AREA_PCT);
    expect(result.h).toBeGreaterThanOrEqual(ZOOM_OVERLAY.MIN_ZOOM_AREA_PCT);
    expect(result.w).toBeCloseTo(result.h, 5);
  });

  it('w_pct = h_pct invariant holds for any spreadRatio (ratio param is no-op)', () => {
    const a = enforceMinSize({ x: 0, y: 0, w: 2, h: 5 }, 0.5);
    const b = enforceMinSize({ x: 0, y: 0, w: 2, h: 5 }, 2);
    expect(a.w).toBe(b.w);
    expect(a.h).toBe(b.h);
    expect(a.w).toBeCloseTo(a.h, 5);
  });

  it('leaves valid square-pct geometry unchanged', () => {
    const result = enforceMinSize({ x: 0, y: 0, w: 50, h: 50 }, 2);
    expect(result).toEqual({ x: 0, y: 0, w: 50, h: 50 });
  });
});

describe('computeMove', () => {
  it('shifts x by deltaX_pct and y by deltaY_pct (px → %)', () => {
    const start = { x: 10, y: 10, w: 30, h: 30 };
    const next = computeMove(start, { x: 0, y: 0 }, { x: 100, y: 50 }, 1000, 500);
    expect(next.x).toBeCloseTo(20, 5); // 100/1000*100=10 → 10+10=20
    expect(next.y).toBeCloseTo(20, 5); // 50/500*100=10 → 10+10=20
    expect(next.w).toBe(30);
    expect(next.h).toBe(30);
  });

  it('clamps when moved out of bounds', () => {
    const start = { x: 80, y: 80, w: 30, h: 30 };
    const next = computeMove(start, { x: 0, y: 0 }, { x: 1000, y: 500 }, 1000, 500);
    // x would go to 80 + 100 = 180, clamped to 70 (100 - 30)
    expect(next.x).toBe(70);
    expect(next.y).toBe(70);
  });
});

describe('computeResize — corner br', () => {
  it('expands w/h with w_pct = h_pct lock (pixel ratio matches spread)', () => {
    const start = { x: 0, y: 0, w: 20, h: 20 };
    // ratio = 2 (1000/500); drag pointer 200px right, 100px down
    const next = computeResize('br', start, { x: 0, y: 0 }, { x: 200, y: 100 }, 1000, 500, 2);
    // dx=200/1000*100=20 → desiredW=40; dy=100/500*100=20 → desiredH=40
    // newW = max(40, 40) = 40; newH = newW = 40
    expect(next.x).toBe(0);
    expect(next.y).toBe(0);
    expect(next.w).toBeCloseTo(40, 5);
    expect(next.h).toBeCloseTo(40, 5);
  });
});

describe('computeResize — edge r', () => {
  it('expands w, h follows w (lock), anchor l fixed, vertical centering', () => {
    const start = { x: 10, y: 10, w: 20, h: 20 };
    const next = computeResize('r', start, { x: 0, y: 0 }, { x: 100, y: 0 }, 1000, 500, 2);
    // dx=100/1000*100=10 → newW=30; newH=newW=30
    // newY = 10 + (20-30)/2 = 5
    expect(next.x).toBe(10);
    expect(next.w).toBeCloseTo(30, 5);
    expect(next.h).toBeCloseTo(30, 5);
    expect(next.y).toBeCloseTo(5, 5);
  });
});

describe('buildDefaultZoomGeometry', () => {
  it('returns centered 50% × 50% (pixel ratio matches spread regardless of spreadRatio)', () => {
    const result = buildDefaultZoomGeometry(2);
    expect(result.w).toBe(50);
    expect(result.h).toBe(50);
    expect(result.x).toBeCloseTo(25, 5);
    expect(result.y).toBeCloseTo(25, 5);
  });

  it('output is independent of spreadRatio param (kept for signature compat)', () => {
    expect(buildDefaultZoomGeometry(0.4)).toEqual(buildDefaultZoomGeometry(2));
    expect(buildDefaultZoomGeometry(0)).toEqual(buildDefaultZoomGeometry(2));
  });
});

describe('drawRectFromPointers', () => {
  it('locks w_pct = h_pct = max(rawW, rawH)', () => {
    // Drag 50% wide, 10% tall; expects square in % space
    const result = drawRectFromPointers({ x: 10, y: 10 }, { x: 60, y: 20 }, 2);
    expect(result.w).toBe(50); // max(50, 10)
    expect(result.h).toBe(50);
    expect(result.x).toBe(10);
    expect(result.y).toBe(10);
  });

  it('expands smaller axis when dragged opposite direction', () => {
    // Drag from right-to-left: current.x < start.x
    const result = drawRectFromPointers({ x: 60, y: 30 }, { x: 20, y: 10 }, 2);
    // rawW=40, rawH=20, locked=max(40,20)=40
    expect(result.w).toBe(40);
    expect(result.h).toBe(40);
    // current.x < start.x → finalX = start.x - locked = 60 - 40 = 20
    // current.y < start.y → finalY = start.y - locked = 30 - 40 = -10 → clamped to 0
    expect(result.x).toBe(20);
    expect(result.y).toBe(0);
  });
});
