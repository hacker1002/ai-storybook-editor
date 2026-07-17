// Unit tests for the Lineup canvas scale math (design 02 §2.3, README §4.3). Pure module → no DOM.

import { describe, expect, it } from 'vitest';
import type { LineupEntry } from '@/types/sketch';
import {
  LINEUP_LAYOUT,
  computeLineupScale,
  computeTopMeters,
  imageHeightPx,
} from './lineup-scale-math';

const entry = (heightCm: number | null, ref = `@e${heightCm}/base`): LineupEntry => ({
  kind: 'characters',
  entityKey: 'e',
  variantKey: 'base',
  ref,
  imageUrl: 'https://example.test/crop.png',
  heightCm,
});

/** Stage tall enough that usableH is a round 1000px → pxPerCm reads as an exact fraction. */
const STAGE_H = 1000 + LINEUP_LAYOUT.labelStripPx + LINEUP_LAYOUT.topPaddingPx;

describe('computeTopMeters', () => {
  it('falls back to the default 2 m ruler when nothing is selected', () => {
    expect(computeTopMeters([])).toBe(LINEUP_LAYOUT.defaultTopMeters);
  });

  it.each([
    [5, 0.5], // a 5 cm prop still gets a full 0.5 m ruler (min one step)
    [50, 0.5], // exactly on a step boundary → no needless extra step
    [51, 1],
    [100, 1],
    [110, 1.5], // the float-dust case: 1.1 / 0.5 = 2.2000000000000006
    [150, 1.5],
    [151, 2],
    [300, 3],
  ])('rounds a %i cm tallest entry up to a %s m ruler', (heightCm, expected) => {
    expect(computeTopMeters([entry(heightCm)])).toBe(expected);
  });

  it('scales to the TALLEST entry, ignoring order', () => {
    expect(computeTopMeters([entry(5, 'a'), entry(180, 'b'), entry(90, 'c')])).toBe(2);
  });

  it('ignores null heights and still yields a drawable ruler', () => {
    expect(computeTopMeters([entry(null, 'a')])).toBe(LINEUP_LAYOUT.rulerStepMeters);
    expect(computeTopMeters([entry(null, 'a'), entry(120, 'b')])).toBe(1.5);
  });
});

describe('computeLineupScale', () => {
  it('derives one shared pxPerCm from the usable height', () => {
    const scale = computeLineupScale([entry(200)], STAGE_H);

    expect(scale.topMeters).toBe(2);
    expect(scale.usableHeightPx).toBe(1000);
    expect(scale.pxPerCm).toBeCloseTo(1000 / 200, 10); // 5 px/cm
    expect(scale.baselineY).toBe(STAGE_H - LINEUP_LAYOUT.labelStripPx);
  });

  it('places the tallest crop exactly between the top padding and the baseline', () => {
    const tallest = entry(200);
    const scale = computeLineupScale([tallest], STAGE_H);

    const topOfCrop = scale.baselineY - imageHeightPx(tallest, scale.pxPerCm);
    expect(topOfCrop).toBeCloseTo(LINEUP_LAYOUT.topPaddingPx, 10);
  });

  it('keeps relative sizes honest across wildly different heights (no min-size clamp)', () => {
    const prop = entry(5, 'prop');
    const giant = entry(300, 'giant');
    const scale = computeLineupScale([prop, giant], STAGE_H);

    const propH = imageHeightPx(prop, scale.pxPerCm);
    const giantH = imageHeightPx(giant, scale.pxPerCm);
    expect(giantH / propH).toBeCloseTo(60, 10); // 300cm / 5cm — the ratio survives the scale
    expect(propH).toBeGreaterThan(0);
  });

  it('emits a line every 0.5 m up to topMeters, spaced by pxPerCm', () => {
    const scale = computeLineupScale([entry(200)], STAGE_H);

    expect(scale.lines.map((l) => l.meters)).toEqual([0.5, 1, 1.5, 2]);
    // lineY(m) = baselineY − m × 100 × pxPerCm
    expect(scale.lines[0].y).toBeCloseTo(scale.baselineY - 0.5 * 100 * scale.pxPerCm, 10);
    // The top line lands on the top padding — the ruler never runs off the stage.
    expect(scale.lines[scale.lines.length - 1].y).toBeCloseTo(LINEUP_LAYOUT.topPaddingPx, 10);
  });

  it('renders the default 2 m ruler when empty (never blank)', () => {
    const scale = computeLineupScale([], STAGE_H);

    expect(scale.topMeters).toBe(2);
    expect(scale.lines).toHaveLength(4);
    expect(scale.pxPerCm).toBeGreaterThan(0);
  });

  it('guards the unmeasured stage (height 0) instead of going negative or dividing by zero', () => {
    const scale = computeLineupScale([entry(180)], 0);

    expect(scale.pxPerCm).toBe(0);
    expect(scale.usableHeightPx).toBe(0);
    expect(scale.baselineY).toBe(0);
    expect(scale.lines.every((l) => Number.isFinite(l.y))).toBe(true);
    expect(imageHeightPx(entry(180), scale.pxPerCm)).toBe(0);
  });

  it('guards a stage shorter than the chrome, and a non-finite measurement', () => {
    expect(computeLineupScale([entry(180)], 10).usableHeightPx).toBe(0);
    expect(computeLineupScale([entry(180)], Number.NaN).pxPerCm).toBe(0);
  });

  it('re-derives a bigger pxPerCm as the stage grows (zoom in)', () => {
    const at100 = computeLineupScale([entry(200)], STAGE_H);
    const at200 = computeLineupScale([entry(200)], STAGE_H * 2);

    expect(at200.pxPerCm).toBeGreaterThan(at100.pxPerCm);
    expect(at200.topMeters).toBe(at100.topMeters); // zoom changes size, never the scale ceiling
  });
});

describe('imageHeightPx', () => {
  it('multiplies the entry height by the shared scale', () => {
    expect(imageHeightPx(entry(120), 2)).toBe(240);
  });

  it('treats a null height as 0 (defensive — the parent only passes selectable entries)', () => {
    expect(imageHeightPx(entry(null), 2)).toBe(0);
  });
});
