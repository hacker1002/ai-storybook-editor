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
  DEFAULTS,
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

/** Crop carrying an entity affinity key (= tags[0].object_key). Drives
 *  `partitionByEntityAffinity` clustering. */
function entityCrop(
  id: string,
  objectKey: string,
  widthPct: number,
  heightPct: number,
): CropInput {
  return { id, widthPct, heightPct, objectKey };
}

/** Returns the 0-based sheet index a crop id landed on, or -1 if unplaced. */
function sheetOf(sheets: SheetLayout[], id: string): number {
  return sheets.findIndex((s) => s.placements.some((p) => p.id === id));
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

  it('default gutters are asymmetric — single crop offset by gutterX+marginLeftExtra / gutterY=8', () => {
    // One crop packs at origin (0,0); its x offset == gutterX + marginLeftExtra
    // (the extra left margin that gives 2-digit index badges room), y offset ==
    // gutterY. Pins the asymmetric default + 64px left margin (32+32).
    const { sheets } = computeCropSheetLayout([crop('only', 50, 50)], config(1));
    const g = sheets[0].placements[0].geometry;
    expect(g.x).toBe(DEFAULTS.gutterX + DEFAULTS.marginLeftExtra);
    expect(g.y).toBe(8);
  });

  it('honours explicit gutterX / gutterY overrides (x still adds marginLeftExtra)', () => {
    const { sheets } = computeCropSheetLayout(
      [crop('only', 50, 50)],
      config(1, { gutterX: 40, gutterY: 12 }),
    );
    const g = sheets[0].placements[0].geometry;
    expect(g.x).toBe(40 + DEFAULTS.marginLeftExtra);
    expect(g.y).toBe(12);
  });

  it('two side-by-side crops keep a 2·gutterX horizontal gap when packed in a row', () => {
    // Two small equal crops pack into one row; the inner horizontal gap between
    // them equals 2·gutterX (right pad of the left crop + left pad of the right).
    const { sheets } = computeCropSheetLayout(
      [crop('l', 20, 20), crop('r', 20, 20)],
      config(1, { gutterX: 16, gutterY: 8 }),
    );
    const ps = [...sheets[0].placements].sort((a, b) => a.geometry.x - b.geometry.x);
    const [left, right] = ps;
    const sameRow = left.geometry.y === right.geometry.y;
    if (sameRow) {
      const gap = right.geometry.x - (left.geometry.x + left.geometry.w);
      expect(gap).toBe(32);
    } else {
      // Packed in a column instead — assert the vertical gap is 2·gutterY.
      const top = ps.sort((a, b) => a.geometry.y - b.geometry.y)[0];
      const bottom = ps[1];
      expect(bottom.geometry.y - (top.geometry.y + top.geometry.h)).toBe(16);
    }
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

// ── partitionByEntityAffinity (tested via the public computeCropSheetLayout) ──
// Phase 02 replaced pure LPT `partitionByArea` with entity-affinity clustering:
// crops sharing an `objectKey` stay on ONE sheet (K≥2); K=1 gathers everyone;
// an entity whose cluster exceeds the per-sheet area budget AND has >1 crop is
// split across the smallest buckets. Asserted through the public API by which
// sheet each crop id lands on.
describe('computeCropSheetLayout — entity affinity (partitionByEntityAffinity)', () => {
  it('K=1 gathers ALL crops onto the single sheet regardless of objectKey', () => {
    const crops = [
      entityCrop('a1', 'alpha', 20, 20),
      entityCrop('b1', 'beta', 20, 20),
      entityCrop('a2', 'alpha', 20, 20),
    ];
    const { sheets } = computeCropSheetLayout(crops, config(1));
    expect(sheets).toHaveLength(1);
    expect(sheets[0].placements.map((p) => p.id).sort()).toEqual(['a1', 'a2', 'b1']);
    assertNoOverlap(sheets[0]);
  });

  it('K≥2 keeps a same-entity cluster (small, within budget) together on one sheet', () => {
    // Two entities, each with 2 equal-area crops. Budget per sheet = totalArea/2
    // = exactly one entity's worth, so neither cluster is "oversized" → each
    // entity stays whole on its own sheet.
    const crops = [
      entityCrop('a1', 'alpha', 20, 20),
      entityCrop('a2', 'alpha', 20, 20),
      entityCrop('b1', 'beta', 20, 20),
      entityCrop('b2', 'beta', 20, 20),
    ];
    const { sheets } = computeCropSheetLayout(crops, config(2));
    // a1/a2 share a sheet; b1/b2 share a sheet; the two entities are on
    // different sheets.
    expect(sheetOf(sheets, 'a1')).toBe(sheetOf(sheets, 'a2'));
    expect(sheetOf(sheets, 'b1')).toBe(sheetOf(sheets, 'b2'));
    expect(sheetOf(sheets, 'a1')).not.toBe(sheetOf(sheets, 'b1'));
    for (const s of sheets) assertNoOverlap(s);
  });

  it('an oversized single-entity cluster (cluster area > budget, >1 crop) is split across sheets', () => {
    // One dominant entity with 4 large crops + a tiny second entity. With K=2,
    // budget = totalArea/2; alpha's 4 big crops far exceed it → alpha is split
    // (crop-by-crop into the smallest bucket) instead of piling onto one sheet.
    const crops = [
      entityCrop('a1', 'alpha', 60, 60),
      entityCrop('a2', 'alpha', 60, 60),
      entityCrop('a3', 'alpha', 60, 60),
      entityCrop('a4', 'alpha', 60, 60),
      entityCrop('b1', 'beta', 10, 10),
    ];
    const { sheets } = computeCropSheetLayout(crops, config(2));
    const alphaSheets = new Set(
      ['a1', 'a2', 'a3', 'a4'].map((id) => sheetOf(sheets, id)),
    );
    // Split → alpha's crops occupy BOTH sheets (not all on one).
    expect(alphaSheets.size).toBe(2);
    // Every crop placed exactly once, no overlaps.
    const ids = sheets.flatMap((s) => s.placements.map((p) => p.id)).sort();
    expect(ids).toEqual(['a1', 'a2', 'a3', 'a4', 'b1']);
    for (const s of sheets) assertNoOverlap(s);
  });

  it('crops with no objectKey fall into a single __none__ cluster (kept together when within budget)', () => {
    const crops = [
      crop('n1', 15, 15), // no objectKey → __none__
      crop('n2', 15, 15),
      entityCrop('x1', 'x', 15, 15),
      entityCrop('x2', 'x', 15, 15),
    ];
    const { sheets } = computeCropSheetLayout(crops, config(2));
    expect(sheetOf(sheets, 'n1')).toBe(sheetOf(sheets, 'n2'));
    expect(sheetOf(sheets, 'x1')).toBe(sheetOf(sheets, 'x2'));
    for (const s of sheets) assertNoOverlap(s);
  });

  it('is deterministic with affinity metadata — same input twice → deep-equal', () => {
    const crops = [
      entityCrop('a1', 'alpha', 30, 30),
      entityCrop('b1', 'beta', 40, 25),
      entityCrop('a2', 'alpha', 20, 50),
    ];
    const first = computeCropSheetLayout(crops, config(2));
    const second = computeCropSheetLayout(crops, config(2));
    expect(second).toEqual(first);
  });
});

// ── preserveInputOrder — cluster appearance order (sheet assignment, K≥2) ────

describe('computeCropSheetLayout — preserveInputOrder flag', () => {
  // 3 clusters so the big one stays within budget (not oversized-split):
  // leena appears first (1 crop, 400u²-ish), didi has the LARGEST total area
  // (2 crops), momo last. budget = total/2 > didi's area → didi stays whole.
  const orderingCrops = [
    entityCrop('leena/base', 'leena', 20, 20),
    entityCrop('didi/base', 'didi', 15, 15),
    entityCrop('didi/v1', 'didi', 15, 15),
    entityCrop('momo/base', 'momo', 20, 20),
  ];

  it('flag-off (explicit false) is byte-identical to the omitted default (golden parity)', () => {
    const omitted = computeCropSheetLayout(orderingCrops, config(2));
    const explicit = computeCropSheetLayout(
      orderingCrops,
      config(2, { preserveInputOrder: false }),
    );
    expect(explicit).toEqual(omitted);
  });

  it('default (flag off): the largest-area cluster (didi) is bucketed first → sheet 0', () => {
    const { sheets } = computeCropSheetLayout(orderingCrops, config(2));
    expect(sheetOf(sheets, 'didi/base')).toBe(0);
    expect(sheetOf(sheets, 'leena/base')).toBe(1);
  });

  it('flag-on: clusters are bucketed in APPEARANCE order — leena (first in input) lands sheet 0, didi does NOT jump ahead on area', () => {
    const { sheets } = computeCropSheetLayout(
      orderingCrops,
      config(2, { preserveInputOrder: true }),
    );
    expect(sheetOf(sheets, 'leena/base')).toBe(0);
    expect(sheetOf(sheets, 'didi/base')).toBe(1);
    expect(sheetOf(sheets, 'didi/v1')).toBe(1);
    // NOTE: no assertion on placements order WITHIN a sheet here — potpack
    // still size-sorts unequal boxes (fill optimization); input order only
    // breaks EQUAL-metric ties (see the equal-size tie-break tests below).
    for (const s of sheets) assertNoOverlap(s);
  });

  it('flag-on keeps clusters whole and every crop placed exactly once', () => {
    const { sheets } = computeCropSheetLayout(
      orderingCrops,
      config(2, { preserveInputOrder: true }),
    );
    const ids = sheets.flatMap((s) => s.placements.map((p) => p.id)).sort();
    expect(ids).toEqual(['didi/base', 'didi/v1', 'leena/base', 'momo/base']);
    expect(sheetOf(sheets, 'didi/base')).toBe(sheetOf(sheets, 'didi/v1'));
  });

  it('flag-on is deterministic — same input twice → deep-equal', () => {
    const first = computeCropSheetLayout(
      orderingCrops,
      config(2, { preserveInputOrder: true }),
    );
    const second = computeCropSheetLayout(
      orderingCrops,
      config(2, { preserveInputOrder: true }),
    );
    expect(second).toEqual(first);
  });

  it('flag-on with K=1 is a no-op (single bucket either way)', () => {
    const flagOff = computeCropSheetLayout(orderingCrops, config(1));
    const flagOn = computeCropSheetLayout(
      orderingCrops,
      config(1, { preserveInputOrder: true }),
    );
    expect(flagOn).toEqual(flagOff);
  });
});

// ── preserveInputOrder — potpack equal-size tie-break (in-sheet placement) ───

describe('computeCropSheetLayout — preserveInputOrder potpack tie-break', () => {
  // Sprite regression fixture: 3 EQUAL square cells whose ids sort
  // alphabetically AGAINST input order — `didi` < `leela` but didi comes LAST
  // in input (remix.characters order). Pre-fix, the id-alphabetical tie-break
  // packed didi first → top-left cell carried ordinal badge 3.
  const equalCells = [
    entityCrop('character/leela/edited', 'leela', 30, 30),
    entityCrop('character/leela/school', 'leela', 30, 30),
    entityCrop('character/didi/base', 'didi', 30, 30),
  ];

  /** Placement ids sorted in visual reading order (top → bottom, left → right). */
  function readingOrder(sheet: SheetLayout): string[] {
    return [...sheet.placements]
      .sort((a, b) => a.geometry.y - b.geometry.y || a.geometry.x - b.geometry.x)
      .map((p) => p.id);
  }

  it('flag-on: equal-size cells place in INPUT order — first crop lands top-left', () => {
    const { sheets } = computeCropSheetLayout(
      equalCells,
      config(1, { preserveInputOrder: true }),
    );
    expect(readingOrder(sheets[0])).toEqual([
      'character/leela/edited',
      'character/leela/school',
      'character/didi/base',
    ]);
    assertNoOverlap(sheets[0]);
  });

  it('flag-off: equal-size tie-break stays id-alphabetical — didi (alphabetically first) lands top-left (mix-plane golden parity)', () => {
    const { sheets } = computeCropSheetLayout(equalCells, config(1));
    expect(readingOrder(sheets[0])[0]).toBe('character/didi/base');
    assertNoOverlap(sheets[0]);
  });

  it('flag-on: unequal boxes still pack size-sorted — input order only breaks ties', () => {
    // didi is the LARGEST box and last in input → still placed first (top-left).
    const mixed = [
      entityCrop('character/leela/edited', 'leela', 20, 20),
      entityCrop('character/leela/school', 'leela', 20, 20),
      entityCrop('character/didi/base', 'didi', 40, 40),
    ];
    const { sheets } = computeCropSheetLayout(
      mixed,
      config(1, { preserveInputOrder: true }),
    );
    const first = readingOrder(sheets[0])[0];
    expect(first).toBe('character/didi/base');
    assertNoOverlap(sheets[0]);
  });
});
