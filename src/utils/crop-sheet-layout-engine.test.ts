// crop-sheet-layout-engine.test.ts — Unit tests for the pure crop-sheet layout
// engine. Covers spec 05-05 §5 (toPixels → partitionByArea → packOneSheet).
//
// Highest-value test: CRIT-1 regression — boxes wider than the seed bin width
// must NOT overlap. The pre-fix `startWidth` seed could fall below the widest
// box, leaving it unplaced at (0,0) and overlapping every other unplaced box.

import { describe, it, expect } from 'vitest';
import {
  computeCropSheetLayout,
  ALLOWED_RATIOS,
} from './crop-sheet-layout-engine';
import type {
  CropInput,
  LayoutConfig,
  CropPlacement,
  SheetLayout,
} from './crop-sheet-layout-engine';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A 2-page-spread sized like a real book (dimension code → 2688×1512). */
const SPREAD = { width: 2688, height: 1512 };

function crop(id: string, widthPct: number, heightPct: number): CropInput {
  return { id, widthPct, heightPct };
}

function config(sheetCount: number, over: Partial<LayoutConfig> = {}): LayoutConfig {
  return { sheetCount, spread: SPREAD, ...over };
}

/** True if two integer rects overlap (touching edges do NOT count as overlap). */
function rectsOverlap(
  a: CropPlacement['geometry'],
  b: CropPlacement['geometry'],
): boolean {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h
  );
}

/** Asserts no two placements within a sheet overlap. */
function assertNoOverlap(sheet: SheetLayout): void {
  const p = sheet.placements;
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      expect(
        rectsOverlap(p[i].geometry, p[j].geometry),
        `placements "${p[i].id}" and "${p[j].id}" overlap on sheet ${sheet.index}`,
      ).toBe(false);
    }
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('computeCropSheetLayout — crop-sheet layout engine §5', () => {
  // CRIT-1 regression: two crops each 50%×50% of the spread inflate to a width
  // (1344 + 2·gutter) far above the unfloored sqrt-seed startWidth for every
  // ratio. Before the fix, both stayed at (0,0) → full overlap.
  it('CRIT-1: two wide 50%×50% crops on one sheet do not overlap', () => {
    const crops = [crop('c1', 50, 50), crop('c2', 50, 50)];
    const { sheets } = computeCropSheetLayout(crops, config(1));

    expect(sheets).toHaveLength(1);
    expect(sheets[0].placements).toHaveLength(2);
    assertNoOverlap(sheets[0]);
    // A real (non-corrupt) layout always fills part of a positive-area sheet.
    expect(sheets[0].fill).toBeGreaterThan(0);
    expect(sheets[0].sheetGeometry.width).toBeGreaterThan(0);
    expect(sheets[0].sheetGeometry.height).toBeGreaterThan(0);
    // The two crops must not both sit at the origin.
    const origins = sheets[0].placements.filter(
      (p) => p.geometry.x === sheets[0].placements[0].geometry.x &&
        p.geometry.y === sheets[0].placements[0].geometry.y,
    );
    expect(origins.length).toBeLessThan(2);
  });

  // CRIT-1 regression at scale: 5 crops with size variance, all on one sheet.
  it('CRIT-1: 5 crops with size variance on one sheet — zero pairwise overlap', () => {
    const crops = [
      crop('a', 60, 45),
      crop('b', 30, 70),
      crop('c', 48, 48),
      crop('d', 20, 25),
      crop('e', 55, 35),
    ];
    const { sheets } = computeCropSheetLayout(crops, config(1));

    expect(sheets).toHaveLength(1);
    expect(sheets[0].placements).toHaveLength(5);
    assertNoOverlap(sheets[0]);
    expect(sheets[0].fill).toBeGreaterThan(0);
  });

  it('empty crops → sheetCount empty sheets (placements: [])', () => {
    const { sheets } = computeCropSheetLayout([], config(3));
    expect(sheets).toHaveLength(3);
    for (const s of sheets) {
      expect(s.placements).toEqual([]);
      expect(s.fill).toBe(0);
      expect(s.sheetGeometry).toEqual({ width: 0, height: 0 });
    }
  });

  it('sheetCount > N → K−N sheets with placements: []', () => {
    const crops = [crop('c1', 40, 40), crop('c2', 30, 30)]; // N = 2
    const { sheets } = computeCropSheetLayout(crops, config(5)); // K = 5

    expect(sheets).toHaveLength(5);
    const nonEmpty = sheets.filter((s) => s.placements.length > 0);
    const empty = sheets.filter((s) => s.placements.length === 0);
    expect(nonEmpty).toHaveLength(2); // each crop lands on its own sheet (LPT)
    expect(empty).toHaveLength(3); // K − N = 3 empty sheets
    // Every assigned crop appears exactly once across all sheets.
    const ids = sheets.flatMap((s) => s.placements.map((p) => p.id)).sort();
    expect(ids).toEqual(['c1', 'c2']);
  });

  it('sheetCount < 1 is clamped to 1', () => {
    const crops = [crop('c1', 40, 40)];
    expect(computeCropSheetLayout(crops, config(0)).sheets).toHaveLength(1);
    expect(computeCropSheetLayout(crops, config(-5)).sheets).toHaveLength(1);
    // Fractional counts floor then clamp.
    expect(computeCropSheetLayout(crops, config(0.7)).sheets).toHaveLength(1);
  });

  it('is deterministic — same input run twice → deep-equal output', () => {
    const crops = [
      crop('z', 35, 60),
      crop('a', 50, 50),
      crop('m', 25, 25),
      crop('q', 70, 40),
    ];
    const first = computeCropSheetLayout(crops, config(2));
    const second = computeCropSheetLayout(crops, config(2));
    expect(second).toEqual(first);
  });

  it('every placement fits within its sheetGeometry (x+w ≤ W, y+h ≤ H)', () => {
    const crops = [
      crop('a', 65, 50),
      crop('b', 40, 80),
      crop('c', 30, 30),
      crop('d', 55, 45),
      crop('e', 22, 66),
      crop('f', 48, 33),
    ];
    const { sheets } = computeCropSheetLayout(crops, config(2));

    for (const sheet of sheets) {
      assertNoOverlap(sheet);
      for (const p of sheet.placements) {
        expect(p.geometry.x).toBeGreaterThanOrEqual(0);
        expect(p.geometry.y).toBeGreaterThanOrEqual(0);
        expect(p.geometry.x + p.geometry.w).toBeLessThanOrEqual(
          sheet.sheetGeometry.width,
        );
        expect(p.geometry.y + p.geometry.h).toBeLessThanOrEqual(
          sheet.sheetGeometry.height,
        );
      }
    }
  });

  it('throws on an invalid spread (config error the caller must resolve)', () => {
    expect(() =>
      computeCropSheetLayout([crop('c1', 40, 40)], {
        sheetCount: 1,
        spread: { width: 0, height: 600 },
      }),
    ).toThrow(/invalid spread/);
  });

  it('drops crops with non-positive dimensions, keeps valid ones', () => {
    const crops = [
      crop('good', 40, 40),
      crop('zeroW', 0, 50),
      crop('negH', 30, -10),
    ];
    const { sheets } = computeCropSheetLayout(crops, config(1));
    const ids = sheets.flatMap((s) => s.placements.map((p) => p.id));
    expect(ids).toEqual(['good']);
  });

  it('picks a ratioKey from the allowed set', () => {
    const allowed = new Set(ALLOWED_RATIOS.map((r) => r.key));
    const { sheets } = computeCropSheetLayout(
      [crop('a', 50, 50), crop('b', 40, 30)],
      config(1),
    );
    expect(allowed.has(sheets[0].ratioKey)).toBe(true);
  });
});
