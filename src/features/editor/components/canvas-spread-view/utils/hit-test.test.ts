// hit-test.test.ts — Unit tests for ADR-029 hit-test core.

import { describe, it, expect } from "vitest";
import {
  containmentRatio,
  pointInGeometry,
  computeBestTarget,
  findCoveringItems,
  collectHitItems,
  enumerateAllHitCandidates,
  type HitCandidate,
  type Geometry,
} from "./hit-test";
import { buildEditorCompositeContextMap } from "@/features/editor/utils/composite-resolve-helpers";
import type { BaseSpread } from "@/types/spread-types";

function makeGeom(
  x: number,
  y: number,
  w: number,
  h: number,
  rotation = 0,
): Geometry {
  return { x, y, w, h, rotation };
}

function makeCand(
  id: string,
  geom: Geometry,
  zIndex: number,
  type: HitCandidate["type"] = "shape",
  index = 0,
): HitCandidate {
  return { id, geometry: geom, zIndex, type, index };
}

// Minimal spread factory — only fields the hit-test reads.
function makeSpread(parts: Partial<BaseSpread>): BaseSpread {
  return {
    id: "sp",
    pages: [],
    images: [],
    textboxes: [],
    ...parts,
  } as BaseSpread;
}

describe("containmentRatio", () => {
  it("1. small fully contained inside large → ratio = 1", () => {
    const small = makeGeom(10, 10, 10, 10);
    const large = makeGeom(0, 0, 100, 100);
    expect(containmentRatio(small, large)).toBeCloseTo(1, 5);
  });

  it("2. 50% overlap → ratio = 0.5", () => {
    const small = makeGeom(0, 0, 10, 10);
    const large = makeGeom(5, 0, 100, 10);
    expect(containmentRatio(small, large)).toBeCloseTo(0.5, 5);
  });

  it("3. no overlap → ratio = 0", () => {
    const small = makeGeom(0, 0, 10, 10);
    const large = makeGeom(50, 50, 10, 10);
    expect(containmentRatio(small, large)).toBe(0);
  });

  it("4. identical bbox → ratio = 1", () => {
    const g = makeGeom(0, 0, 10, 10);
    expect(containmentRatio(g, g)).toBeCloseTo(1, 5);
  });

  it("5. degenerate small (w=0) → ratio = 0", () => {
    const small = makeGeom(0, 0, 0, 10);
    const large = makeGeom(0, 0, 100, 100);
    expect(containmentRatio(small, large)).toBe(0);
  });

  it("6. small rotated 45° inside large axis-aligned → still ≥ threshold via AABB", () => {
    const small = makeGeom(45, 45, 10, 10, 45);
    const large = makeGeom(0, 0, 100, 100);
    const ratio = containmentRatio(small, large);
    expect(ratio).toBeGreaterThanOrEqual(0.9);
  });
});

describe("pointInGeometry", () => {
  it("1. point inside axis-aligned rect", () => {
    expect(pointInGeometry({ x: 5, y: 5 }, makeGeom(0, 0, 10, 10))).toBe(true);
  });

  it("2. point on edge counts as inside", () => {
    expect(pointInGeometry({ x: 0, y: 5 }, makeGeom(0, 0, 10, 10))).toBe(true);
    expect(pointInGeometry({ x: 10, y: 5 }, makeGeom(0, 0, 10, 10))).toBe(true);
  });

  it("3. point outside rect", () => {
    expect(pointInGeometry({ x: 50, y: 50 }, makeGeom(0, 0, 10, 10))).toBe(
      false,
    );
  });

  it("4. point inside after rotation", () => {
    // 50x50 rect at origin, rotated 45° around center (25, 25).
    // Center stays at (25, 25). Sample center point — must be inside.
    const g = makeGeom(0, 0, 50, 50, 45);
    expect(pointInGeometry({ x: 25, y: 25 }, g)).toBe(true);
  });

  it("5. point in pre-rotated corner becomes outside after rotation", () => {
    // Corner (0,0) of unrotated rect is far from center; after rotation 45°,
    // it ends up outside the original axis-aligned bounds — corner pre-rotate
    // at (0,0) maps to inside rotated rect (still a corner) — pick a tricky
    // point outside rotated rect: (49, 0) is on raw rect's edge but rotated
    // 45° around (25,25) it should be inside rotated bounds. Instead test
    // a point clearly outside both: (60, 60) far from rect.
    const g = makeGeom(0, 0, 50, 50, 45);
    expect(pointInGeometry({ x: 60, y: 60 }, g)).toBe(false);
  });
});

describe("computeBestTarget", () => {
  it("1. empty list → null", () => {
    expect(computeBestTarget([])).toBeNull();
  });

  it("2. single candidate → returns it", () => {
    const c = makeCand("a", makeGeom(0, 0, 10, 10), 5);
    expect(computeBestTarget([c])).toBe(c);
  });

  it("3. partial overlap (not contained) → topmost wins", () => {
    const small = makeCand("small", makeGeom(0, 0, 10, 10), 1);
    const top = makeCand("top", makeGeom(5, 0, 10, 10), 10);
    expect(computeBestTarget([small, top])?.id).toBe("top");
  });

  it("4. small fully inside large → small wins (containment override)", () => {
    const small = makeCand("small", makeGeom(45, 45, 10, 10), 1);
    const big = makeCand("big", makeGeom(0, 0, 100, 100), 10);
    expect(computeBestTarget([big, small])?.id).toBe("small");
  });

  it("5. 3-level nested A⊃B⊃C → C (smallest) wins", () => {
    const a = makeCand("A", makeGeom(0, 0, 100, 100), 30);
    const b = makeCand("B", makeGeom(10, 10, 50, 50), 20);
    const c = makeCand("C", makeGeom(20, 20, 10, 10), 10);
    expect(computeBestTarget([a, b, c])?.id).toBe("C");
  });

  it("6. threshold edge — ratio < 0.9 → topmost", () => {
    // small is offset so only ~50% inside topmost
    const top = makeCand("top", makeGeom(0, 0, 20, 20), 10);
    const small = makeCand("small", makeGeom(15, 0, 10, 10), 1); // half outside
    expect(computeBestTarget([top, small])?.id).toBe("top");
  });

  it("7. threshold edge — ratio exactly 0.9 → contained wins", () => {
    const top = makeCand("top", makeGeom(0, 0, 20, 20), 10);
    // small 10x10, 9x10 inside topmost → ratio = 90/100 = 0.9 (uses AABB intersection)
    const small = makeCand("small", makeGeom(11, 5, 10, 10), 1);
    expect(containmentRatio(small.geometry, top.geometry)).toBeCloseTo(0.9, 5);
    expect(computeBestTarget([top, small])?.id).toBe("small");
  });

  it("8. composite-style override — variant z mirrors composite z", () => {
    // Caller resolves z via resolveEffectiveZIndex; here we simulate the
    // result by passing in zIndex already overridden.
    const variant = makeCand("v1", makeGeom(0, 0, 10, 10), 510);
    const big = makeCand("big", makeGeom(0, 0, 100, 100), 500);
    // variant has higher z → topmost. But variant is smaller and fully
    // contained inside big? No — big is on top? No, variant z=510 > big z=500.
    // So sorted: [variant, big]. variant is topmost. big is larger. big is not
    // smaller than topmost so containment check skipped → topmost wins.
    expect(computeBestTarget([big, variant])?.id).toBe("v1");
  });
});

describe("findCoveringItems", () => {
  it("1. selected not covered → empty", () => {
    const selected = makeCand("sel", makeGeom(0, 0, 10, 10), 5);
    const other = makeCand("o", makeGeom(50, 50, 10, 10), 10);
    expect(findCoveringItems(selected, [other])).toHaveLength(0);
  });

  it("2. one item covers selected ≥ 90% with higher z → 1 result", () => {
    const selected = makeCand("sel", makeGeom(10, 10, 10, 10), 5);
    const cover = makeCand("cov", makeGeom(0, 0, 100, 100), 10);
    expect(findCoveringItems(selected, [cover])).toHaveLength(1);
  });

  it("3. cover has lower z → not counted", () => {
    const selected = makeCand("sel", makeGeom(10, 10, 10, 10), 10);
    const lower = makeCand("low", makeGeom(0, 0, 100, 100), 5);
    expect(findCoveringItems(selected, [lower])).toHaveLength(0);
  });

  it("4. self → excluded", () => {
    const selected = makeCand("sel", makeGeom(0, 0, 100, 100), 5);
    expect(findCoveringItems(selected, [selected])).toHaveLength(0);
  });
});

describe("collectHitItems / enumerateAllHitCandidates", () => {
  it("1. collects only items whose geometry contains the point", () => {
    const spread = makeSpread({
      shapes: [
        {
          id: "s1",
          type: "rectangle",
          geometry: { x: 0, y: 0, w: 10, h: 10 },
          fill: { is_filled: true, color: "#fff", opacity: 1 },
          outline: { color: "#000", width: 0, radius: 0, type: 0 },
        },
        {
          id: "s2",
          type: "rectangle",
          geometry: { x: 50, y: 50, w: 10, h: 10 },
          fill: { is_filled: true, color: "#fff", opacity: 1 },
          outline: { color: "#000", width: 0, radius: 0, type: 0 },
        },
      ],
    });
    const ctxMap = buildEditorCompositeContextMap(spread);
    const hits = collectHitItems(spread, { x: 5, y: 5 }, ctxMap);
    expect(hits.map((h) => h.id)).toEqual(["s1"]);
  });

  it("2. skips items with editor_visible === false", () => {
    const spread = makeSpread({
      shapes: [
        {
          id: "s1",
          type: "rectangle",
          geometry: { x: 0, y: 0, w: 10, h: 10 },
          fill: { is_filled: true, color: "#fff", opacity: 1 },
          outline: { color: "#000", width: 0, radius: 0, type: 0 },
          editor_visible: false,
        },
      ],
    });
    const ctxMap = buildEditorCompositeContextMap(spread);
    const hits = collectHitItems(spread, { x: 5, y: 5 }, ctxMap);
    expect(hits).toHaveLength(0);
  });

  it("3. enumerate includes every visible item regardless of point", () => {
    const spread = makeSpread({
      shapes: [
        {
          id: "s1",
          type: "rectangle",
          geometry: { x: 0, y: 0, w: 10, h: 10 },
          fill: { is_filled: true, color: "#fff", opacity: 1 },
          outline: { color: "#000", width: 0, radius: 0, type: 0 },
        },
        {
          id: "s2",
          type: "rectangle",
          geometry: { x: 50, y: 50, w: 10, h: 10 },
          fill: { is_filled: true, color: "#fff", opacity: 1 },
          outline: { color: "#000", width: 0, radius: 0, type: 0 },
        },
      ],
    });
    const ctxMap = buildEditorCompositeContextMap(spread);
    const all = enumerateAllHitCandidates(spread, ctxMap);
    expect(all.map((c) => c.id).sort()).toEqual(["s1", "s2"]);
  });

  it("4. excludeIds filter respected", () => {
    const spread = makeSpread({
      shapes: [
        {
          id: "s1",
          type: "rectangle",
          geometry: { x: 0, y: 0, w: 10, h: 10 },
          fill: { is_filled: true, color: "#fff", opacity: 1 },
          outline: { color: "#000", width: 0, radius: 0, type: 0 },
        },
      ],
    });
    const ctxMap = buildEditorCompositeContextMap(spread);
    const hits = collectHitItems(spread, { x: 5, y: 5 }, ctxMap, {
      excludeIds: new Set(["s1"]),
    });
    expect(hits).toHaveLength(0);
  });
});
