// canvas-math-utils.test.ts — design-canvas-width resolver (video render font parity).

import { describe, it, expect, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { resolveDesignCanvasWidth, resolveBleedCanvasSize } from "./canvas-math-utils";
import { DEFAULT_CANVAS_SIZE } from "@/constants/canvas-dimension-constants";

describe("resolveDesignCanvasWidth — derive from dimension", () => {
  it("derives full-bleed width from dimension (= width the live player uses)", () => {
    const expected = resolveBleedCanvasSize(7, 3).full.width;
    expect(resolveDesignCanvasWidth({ dimension: 7, bleedMm: 3 })).toBe(expected);
    expect(expected).toBeCloseTo(1217.72, 1);
  });

  it("defaults bleedMm to 3 when omitted", () => {
    expect(resolveDesignCanvasWidth({ dimension: 7 })).toBe(
      resolveBleedCanvasSize(7, 3).full.width
    );
  });

  it("falls back to legacy DEFAULT_CANVAS_SIZE.width when dimension absent (demo)", () => {
    expect(resolveDesignCanvasWidth({})).toBe(DEFAULT_CANVAS_SIZE.width);
  });

  it("dimension=null (un-dimensioned book) → legacy default", () => {
    expect(resolveDesignCanvasWidth({ dimension: null })).toBe(DEFAULT_CANVAS_SIZE.width);
  });
});
