// extract-crop-fit.test.ts — contain-fit math for the Crops canvas (width-% zoom model).
// ZOOM = { min: 50, max: 400, step: 5 }. Pure fn only — no render harness.

import { describe, it, expect } from 'vitest';
import { computeCropFitZoom } from './extract-crop-fit';

describe('computeCropFitZoom', () => {
  it('returns null when frame or aspect is not measurable yet', () => {
    expect(computeCropFitZoom({ w: 0, h: 600 }, 1.5)).toBeNull();
    expect(computeCropFitZoom({ w: 800, h: 0 }, 1.5)).toBeNull();
    expect(computeCropFitZoom({ w: 800, h: 600 }, 0)).toBeNull();
    expect(computeCropFitZoom({ w: 800, h: 600 }, NaN)).toBeNull();
  });

  it('width-binds at 100% when the image is wider than the frame', () => {
    // imgAspect 2.0 in a 4:3 frame → width is the tighter edge → fill width.
    expect(computeCropFitZoom({ w: 800, h: 600 }, 2.0)).toBe(100);
  });

  it('width-binds at 100% when image aspect equals frame aspect', () => {
    // frame 800×600 (aspect 1.333) + image aspect 1.333 → exactly fills both → 100.
    expect(computeCropFitZoom({ w: 800, h: 600 }, 800 / 600)).toBe(100);
  });

  it('height-binds below 100% for a tall image (snapped down to a step)', () => {
    // Square image in a 4:3 frame: heightBound = (600/800)*1*100 = 75 → snap to 75.
    expect(computeCropFitZoom({ w: 800, h: 600 }, 1.0)).toBe(75);
  });

  it('floors to the ZOOM.step multiple (never overflows the frame)', () => {
    // heightBound = (600/800)*1.1*100 = 82.5 → floor to 80 (step 5), not 85.
    expect(computeCropFitZoom({ w: 800, h: 600 }, 1.1)).toBe(80);
  });

  it('clamps up to ZOOM.min for an extremely tall image', () => {
    // heightBound = (600/800)*0.1*100 = 7.5 → below min 50 → clamp to 50.
    expect(computeCropFitZoom({ w: 800, h: 600 }, 0.1)).toBe(50);
  });

  it('never exceeds 100% even for very wide panoramas (contain, no zoom-in)', () => {
    expect(computeCropFitZoom({ w: 800, h: 600 }, 10)).toBe(100);
  });
});
