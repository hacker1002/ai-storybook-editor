// extract-box-geometry-utils.test.ts — Unit tests for the Objects-tab pure geometry helpers
// (clamp, drag/resize Free vs locked, ratio snap, basis→%, chunk). No DOM/React.

import { describe, it, expect } from 'vitest';
import {
  clamp,
  pointerDeltaToPercent,
  lockRatioForRatio,
  applyDrag,
  applyResize,
  snapBoxToRatio,
  nearestAllowedRatio,
  basisGeometryToPercent,
  chunk,
} from './extract-box-geometry-utils';

describe('clamp', () => {
  it('returns value within range, clamps outside', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe('pointerDeltaToPercent', () => {
  it('converts client delta to % of rect', () => {
    expect(pointerDeltaToPercent(50, 25, 200, 100)).toEqual({ dxPct: 25, dyPct: 25 });
  });
  it('guards against a zero-sized rect', () => {
    expect(pointerDeltaToPercent(10, 10, 0, 0)).toEqual({ dxPct: 0, dyPct: 0 });
  });
});

describe('lockRatioForRatio', () => {
  it('Free → null (no aspect lock)', () => {
    expect(lockRatioForRatio('Free', { w: 100, h: 100 })).toBeNull();
  });
  it('null natural → null', () => {
    expect(lockRatioForRatio('1:1', null)).toBeNull();
  });
  it('1:1 on a square image → 1', () => {
    expect(lockRatioForRatio('1:1', { w: 100, h: 100 })).toBeCloseTo(1, 5);
  });
  it('16:9 box on a 16:9 image is square in %-space (≈1)', () => {
    expect(lockRatioForRatio('16:9', { w: 1600, h: 900 })).toBeCloseTo(1, 5);
  });
});

describe('applyDrag', () => {
  it('moves the box by the delta', () => {
    expect(applyDrag({ x: 10, y: 10, w: 20, h: 20 }, 5, 5)).toEqual({ x: 15, y: 15, w: 20, h: 20 });
  });
  it('clamps so the box stays inside [0,100]', () => {
    expect(applyDrag({ x: 90, y: 10, w: 20, h: 20 }, 20, 0)).toEqual({ x: 80, y: 10, w: 20, h: 20 });
  });
});

describe('applyResize — Free (lockRatio null)', () => {
  it('resizes width + height independently from the SE corner', () => {
    const out = applyResize({ x: 10, y: 10, w: 20, h: 20 }, 'se', 10, 5, null, 1);
    expect(out).toEqual({ x: 10, y: 10, w: 30, h: 25 });
  });
  it('grows from the NW corner, anchoring the opposite edge', () => {
    const out = applyResize({ x: 30, y: 30, w: 20, h: 20 }, 'nw', -10, -10, null, 1);
    expect(out).toEqual({ x: 20, y: 20, w: 30, h: 30 });
  });
  it('returns the start geometry when the result falls below minSize after bounds clamp', () => {
    const start = { x: 99, y: 0, w: 1, h: 1 };
    expect(applyResize(start, 'se', 10, 10, null, 5)).toEqual(start);
  });
});

describe('applyResize — locked (aspect preserved)', () => {
  it('derives height from width, ignoring the y delta', () => {
    const out = applyResize({ x: 10, y: 10, w: 20, h: 20 }, 'se', 10, 999, 1, 1);
    expect(out).toEqual({ x: 10, y: 10, w: 30, h: 30 });
  });
});

describe('snapBoxToRatio', () => {
  it('snaps to a square, preserving area + center', () => {
    const out = snapBoxToRatio({ x: 10, y: 10, w: 40, h: 10 }, 1, 1);
    // area 400 → 20×20; center (30,15) preserved
    expect(out.w).toBeCloseTo(20, 5);
    expect(out.h).toBeCloseTo(20, 5);
    expect(out.x + out.w / 2).toBeCloseTo(30, 5);
    expect(out.y + out.h / 2).toBeCloseTo(15, 5);
  });
});

describe('basisGeometryToPercent', () => {
  it('divides basis 10000 by 100 → %', () => {
    expect(basisGeometryToPercent({ x: 5000, y: 2500, w: 10000, h: 5000 })).toEqual({
      x: 50,
      y: 25,
      w: 100,
      h: 50,
    });
  });
});

describe('nearestAllowedRatio', () => {
  it('square box on square image → 1:1', () => {
    expect(nearestAllowedRatio(50, 50, { w: 100, h: 100 })).toBe('1:1');
  });
  it('16:9-shaped box → 16:9', () => {
    expect(nearestAllowedRatio(80, 45, { w: 100, h: 100 })).toBe('16:9');
  });
});

describe('chunk', () => {
  it('splits into chunks of at most size', () => {
    expect(chunk([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5]]);
  });
  it('handles empty + smaller-than-size arrays', () => {
    expect(chunk([], 3)).toEqual([]);
    expect(chunk([1, 2], 3)).toEqual([[1, 2]]);
  });
});
