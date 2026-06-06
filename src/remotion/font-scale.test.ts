// font-scale.test.ts — locks render font/border parity with the live player.
//
// Invariant (ADR-035): the on-frame text fraction must be identical in the live
// player and the render. Live renders `size*zoomFactor` over a
// `designCanvasWidth*zoomFactor` stage ⇒ fraction = size/designCanvasWidth. Render
// renders `size*fontScale` over a `compositionWidth` frame ⇒ fraction =
// size*fontScale/compositionWidth. Equality holds iff fontScale =
// compositionWidth/designCanvasWidth with designCanvasWidth = the SAME width the
// live store uses (bleedCanvas.full.width). This test guards the regression where a
// missing/legacy width inflated every textbox.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  computeFontScale,
  hasValidDesignCanvasWidth,
  DEFAULT_DESIGN_CANVAS_WIDTH,
} from "./font-scale";
import { resolveBleedCanvasSize } from "@/utils/canvas-math-utils";

const COMPOSITION_WIDTH = 1920; // VIDEO_WIDTH
const SAMPLE_FONT_PX = 24; // authored design-px

/** On-frame text fraction in the live player (zoom-invariant). */
function livePlayerFraction(sizePx: number, designCanvasWidth: number): number {
  const zoomFactor = 0.65; // arbitrary; must cancel
  const liveFontPx = sizePx * zoomFactor;
  const liveStageWidth = designCanvasWidth * zoomFactor;
  return liveFontPx / liveStageWidth;
}

/** On-frame text fraction in the render. */
function renderFraction(sizePx: number, designCanvasWidth: number | undefined): number {
  const fontScale = computeFontScale(COMPOSITION_WIDTH, designCanvasWidth);
  return (sizePx * fontScale) / COMPOSITION_WIDTH;
}

describe("computeFontScale — preview === output parity", () => {
  // A spread of real book dimensions: live store width = bleedCanvas.full.width.
  const dimensions = [1, 2, 7, 8, 9, 16, 19, null]; // incl. un-dimensioned fallback

  it.each(dimensions)(
    "render fraction matches live player fraction for dimension %s",
    (dimension) => {
      const fullWidth = resolveBleedCanvasSize(dimension).full.width;
      const live = livePlayerFraction(SAMPLE_FONT_PX, fullWidth);
      const render = renderFraction(SAMPLE_FONT_PX, fullWidth);
      expect(render).toBeCloseTo(live, 10);
    }
  );

  it("regression: omitting canvasWidth inflates text vs a real full-bleed book", () => {
    // dimension 7 (Square 8×8) → trim 1200, full ≈ 1217.7.
    const fullWidth = resolveBleedCanvasSize(7).full.width;
    const correct = renderFraction(SAMPLE_FONT_PX, fullWidth);
    const buggy = renderFraction(SAMPLE_FONT_PX, undefined); // legacy 800 fallback
    // The old default overshoots by realFullWidth/800 (~1.5×) — the reported bug.
    expect(buggy / correct).toBeCloseTo(fullWidth / DEFAULT_DESIGN_CANVAS_WIDTH, 10);
    expect(buggy).toBeGreaterThan(correct);
  });

  it("falls back to legacy width on missing/invalid input", () => {
    expect(computeFontScale(COMPOSITION_WIDTH, undefined)).toBe(
      COMPOSITION_WIDTH / DEFAULT_DESIGN_CANVAS_WIDTH
    );
    expect(computeFontScale(COMPOSITION_WIDTH, 0)).toBe(
      COMPOSITION_WIDTH / DEFAULT_DESIGN_CANVAS_WIDTH
    );
    expect(computeFontScale(COMPOSITION_WIDTH, -10)).toBe(
      COMPOSITION_WIDTH / DEFAULT_DESIGN_CANVAS_WIDTH
    );
  });

  it("hasValidDesignCanvasWidth gates the warn", () => {
    expect(hasValidDesignCanvasWidth(1217.7)).toBe(true);
    expect(hasValidDesignCanvasWidth(undefined)).toBe(false);
    expect(hasValidDesignCanvasWidth(0)).toBe(false);
  });
});
