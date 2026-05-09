// motion-line-overlay-utils.test.ts — Unit tests for pure geometry helpers.

import { describe, it, expect } from 'vitest';
import {
  computeBaseCenterPct,
  computeTipCenterPct,
  pctToPx,
  pxToPctDelta,
  tipCenterToTopLeft,
  isDegenerate,
  applySelfHeal,
  shaftAngleRad,
  MOTION_LINE_OVERLAY,
  type MotionLineGeometry,
  type ItemGeometry,
} from './motion-line-overlay-utils';

describe('computeBaseCenterPct', () => {
  it('returns center point (x + w/2, y + h/2) of item geometry', () => {
    const item: ItemGeometry = { x: 10, y: 20, w: 30, h: 40 };
    const result = computeBaseCenterPct(item);
    expect(result).toEqual({ x: 25, y: 40 }); // 10 + 30/2 = 25, 20 + 40/2 = 40
  });

  it('handles zero-origin item at (0, 0)', () => {
    const item: ItemGeometry = { x: 0, y: 0, w: 50, h: 50 };
    const result = computeBaseCenterPct(item);
    expect(result).toEqual({ x: 25, y: 25 });
  });

  it('handles odd dimensions', () => {
    const item: ItemGeometry = { x: 5, y: 5, w: 11, h: 13 };
    const result = computeBaseCenterPct(item);
    expect(result).toEqual({ x: 10.5, y: 11.5 });
  });
});

describe('computeTipCenterPct', () => {
  it('returns center point of motion-line geometry', () => {
    const g: MotionLineGeometry = { x: 30, y: 40, w: 20, h: 30 };
    const result = computeTipCenterPct(g);
    expect(result).toEqual({ x: 40, y: 55 }); // 30 + 20/2 = 40, 40 + 30/2 = 55
  });

  it('handles edge case where w/h = 0', () => {
    const g: MotionLineGeometry = { x: 50, y: 50, w: 0, h: 0 };
    const result = computeTipCenterPct(g);
    expect(result).toEqual({ x: 50, y: 50 });
  });
});

describe('pctToPx', () => {
  it('converts percentage points to pixel coordinates', () => {
    const pct = { x: 50, y: 50 };
    const result = pctToPx(pct, 1000, 500);
    expect(result).toEqual({ x: 500, y: 250 });
  });

  it('handles fractional percentages', () => {
    const pct = { x: 25.5, y: 75.2 };
    const result = pctToPx(pct, 1000, 600);
    expect(result.x).toBeCloseTo(255, 5);
    expect(result.y).toBeCloseTo(451.2, 5);
  });

  it('handles zero point', () => {
    const pct = { x: 0, y: 0 };
    const result = pctToPx(pct, 1000, 500);
    expect(result).toEqual({ x: 0, y: 0 });
  });
});

describe('pxToPctDelta', () => {
  it('converts pixel delta to percentage delta', () => {
    const delta = { x: 100, y: 50 };
    const result = pxToPctDelta(delta, 1000, 500);
    expect(result).toEqual({ x: 10, y: 10 }); // 100/1000*100 = 10, 50/500*100 = 10
  });

  it('handles negative deltas', () => {
    const delta = { x: -200, y: -100 };
    const result = pxToPctDelta(delta, 1000, 500);
    expect(result).toEqual({ x: -20, y: -20 });
  });

  it('returns {0, 0} when spreadW or spreadH <= 0 (guard)', () => {
    const delta = { x: 100, y: 50 };
    expect(pxToPctDelta(delta, 0, 500)).toEqual({ x: 0, y: 0 });
    expect(pxToPctDelta(delta, 1000, 0)).toEqual({ x: 0, y: 0 });
    expect(pxToPctDelta(delta, -1, -1)).toEqual({ x: 0, y: 0 });
  });
});

describe('tipCenterToTopLeft', () => {
  it('converts tip center to top-left, clamping within bounds', () => {
    const tipCenter = { x: 50, y: 50 };
    const result = tipCenterToTopLeft(tipCenter, 20, 30);
    // x: 50 - 20/2 = 40; y: 50 - 30/2 = 35
    expect(result).toEqual({ x: 40, y: 35 });
  });

  it('clamps left edge when tip center too close to origin', () => {
    const tipCenter = { x: 5, y: 50 };
    const result = tipCenterToTopLeft(tipCenter, 20, 30);
    // x: clamp(5 - 10, 0, 80) = 0; y: clamp(50 - 15, 0, 70) = 35
    expect(result.x).toBe(0);
    expect(result.y).toBe(35);
  });

  it('clamps right edge when tip center too close to 100', () => {
    const tipCenter = { x: 95, y: 50 };
    const result = tipCenterToTopLeft(tipCenter, 20, 30);
    // x: clamp(95 - 10, 0, 80) = 80; y: clamp(50 - 15, 0, 70) = 35
    expect(result.x).toBe(80);
    expect(result.y).toBe(35);
  });

  it('clamps top edge when tip center too close to top', () => {
    const tipCenter = { x: 50, y: 5 };
    const result = tipCenterToTopLeft(tipCenter, 30, 20);
    // x: clamp(50 - 15, 0, 70) = 35; y: clamp(5 - 10, 0, 80) = 0
    expect(result.x).toBe(35);
    expect(result.y).toBe(0);
  });

  it('clamps bottom edge when tip center too close to bottom', () => {
    const tipCenter = { x: 50, y: 95 };
    const result = tipCenterToTopLeft(tipCenter, 30, 20);
    // x: clamp(50 - 15, 0, 70) = 35; y: clamp(95 - 10, 0, 80) = 80
    expect(result.x).toBe(35);
    expect(result.y).toBe(80);
  });
});

describe('isDegenerate', () => {
  it('returns true when tip center ≈ base center (both axes < threshold)', () => {
    const item: ItemGeometry = { x: 10, y: 10, w: 20, h: 20 };
    const g: MotionLineGeometry = { x: 10, y: 10, w: 20, h: 20 };
    // base = 20, tip = 20 → delta = 0, both < threshold
    const result = isDegenerate(g, item);
    expect(result).toBe(true);
  });

  it('returns true when both deltas < threshold (0.5%)', () => {
    const item: ItemGeometry = { x: 10, y: 10, w: 20, h: 20 };
    const g: MotionLineGeometry = { x: 10.2, y: 10.3, w: 20, h: 20 };
    // base = (20, 20), tip = (20.2, 20.3) → delta < 1
    const result = isDegenerate(g, item);
    expect(result).toBe(true);
  });

  it('returns false when x delta >= threshold', () => {
    const item: ItemGeometry = { x: 10, y: 10, w: 20, h: 20 };
    const g: MotionLineGeometry = { x: 11.5, y: 10, w: 20, h: 20 };
    // base = (20, 20), tip = (21.5, 20) → x delta = 1.5 >= 1
    const result = isDegenerate(g, item);
    expect(result).toBe(false);
  });

  it('returns false when y delta >= threshold', () => {
    const item: ItemGeometry = { x: 10, y: 10, w: 20, h: 20 };
    const g: MotionLineGeometry = { x: 10, y: 11.5, w: 20, h: 20 };
    // base = (20, 20), tip = (20, 21.5) → y delta = 1.5 >= 1
    const result = isDegenerate(g, item);
    expect(result).toBe(false);
  });

  it('returns false when one delta >= threshold but other < threshold', () => {
    const item: ItemGeometry = { x: 10, y: 10, w: 20, h: 20 };
    const g: MotionLineGeometry = { x: 10.5, y: 11.5, w: 20, h: 20 };
    // base = (20, 20), tip = (20.5, 21.5) → x delta = 0.5, y delta = 1.5
    // requires BOTH < threshold, so false
    const result = isDegenerate(g, item);
    expect(result).toBe(false);
  });
});

describe('applySelfHeal', () => {
  it('returns geometry with w/h from item, preserving x/y', () => {
    const g: MotionLineGeometry = { x: 30, y: 40, w: 10, h: 15 };
    const item: ItemGeometry = { x: 20, y: 25, w: 50, h: 60 };
    const result = applySelfHeal(g, item);
    expect(result).toEqual({ x: 30, y: 40, w: 50, h: 60 });
  });

  it('replaces stale or zero w/h with item dimensions', () => {
    const g: MotionLineGeometry = { x: 50, y: 50, w: 0, h: 0 };
    const item: ItemGeometry = { x: 10, y: 10, w: 25, h: 35 };
    const result = applySelfHeal(g, item);
    expect(result).toEqual({ x: 50, y: 50, w: 25, h: 35 });
  });
});

describe('shaftAngleRad', () => {
  it('returns angle from base to tip in radians', () => {
    // base at origin, tip at (1, 0) → angle = 0 (horizontal right)
    const angle = shaftAngleRad({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(angle).toBeCloseTo(0, 5);
  });

  it('returns π/4 for 45° angle (northeast)', () => {
    // base at (0, 0), tip at (1, 1) → 45° = π/4
    const angle = shaftAngleRad({ x: 0, y: 0 }, { x: 1, y: 1 });
    expect(angle).toBeCloseTo(Math.PI / 4, 5);
  });

  it('returns π/2 for straight down', () => {
    // base at (0, 0), tip at (0, 1) → pointing down = π/2 (atan2(1, 0))
    const angle = shaftAngleRad({ x: 0, y: 0 }, { x: 0, y: 1 });
    expect(angle).toBeCloseTo(Math.PI / 2, 5);
  });

  it('returns angle for arbitrary vector', () => {
    // base at (10, 20), tip at (13, 21) → delta = (3, 1)
    const angle = shaftAngleRad({ x: 10, y: 20 }, { x: 13, y: 21 });
    const expected = Math.atan2(1, 3);
    expect(angle).toBeCloseTo(expected, 5);
  });
});

describe('MOTION_LINE_OVERLAY constants', () => {
  it('has required constant keys', () => {
    expect(MOTION_LINE_OVERLAY).toHaveProperty('HIT_SLOP_PX');
    expect(MOTION_LINE_OVERLAY).toHaveProperty('SHAFT_WIDTH_SELECTED_PX');
    expect(MOTION_LINE_OVERLAY).toHaveProperty('SHAFT_WIDTH_UNSELECTED_PX');
    expect(MOTION_LINE_OVERLAY).toHaveProperty('TIP_INNER_RADIUS_PX');
    expect(MOTION_LINE_OVERLAY).toHaveProperty('TIP_OUTER_RING_RADIUS_PX');
    expect(MOTION_LINE_OVERLAY).toHaveProperty('TIP_TRIANGLE_HALF_BASE_PX');
    expect(MOTION_LINE_OVERLAY).toHaveProperty('TIP_TRIANGLE_LENGTH_PX');
    expect(MOTION_LINE_OVERLAY).toHaveProperty('SHAFT_COLOR');
    expect(MOTION_LINE_OVERLAY).toHaveProperty('DEGENERATE_DELTA_PCT');
  });

  it('DEGENERATE_DELTA_PCT equals 1', () => {
    expect(MOTION_LINE_OVERLAY.DEGENERATE_DELTA_PCT).toBe(1);
  });
});
