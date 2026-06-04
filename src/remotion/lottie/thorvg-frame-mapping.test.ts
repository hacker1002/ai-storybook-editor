// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mapFrameToLottie } from "./thorvg-frame-mapping";

// native 30fps, 60-frame loop, rendered at VIDEO_FPS=30 → 1 remotion frame == 1 native frame.
const NATIVE_FPS = 30;
const TOTAL = 60;
const VIDEO_FPS = 30;

describe("mapFrameToLottie", () => {
  it("frame 0 → 0", () => {
    expect(mapFrameToLottie(0, VIDEO_FPS, NATIVE_FPS, TOTAL)).toBe(0);
  });

  it("maps real time → native frame (30fps render, 30fps native)", () => {
    expect(mapFrameToLottie(15, VIDEO_FPS, NATIVE_FPS, TOTAL)).toBeCloseTo(15, 6);
    expect(mapFrameToLottie(30, VIDEO_FPS, NATIVE_FPS, TOTAL)).toBeCloseTo(30, 6);
  });

  it("loops via modulo past totalFrames", () => {
    // frame 60 → 60s*... → 60 native frames → mod 60 == 0
    expect(mapFrameToLottie(60, VIDEO_FPS, NATIVE_FPS, TOTAL)).toBeCloseTo(0, 6);
    // frame 75 → 75 native → mod 60 == 15
    expect(mapFrameToLottie(75, VIDEO_FPS, NATIVE_FPS, TOTAL)).toBeCloseTo(15, 6);
  });

  it("produces fractional frames when native fps < video fps (interpolation)", () => {
    // native 24fps rendered at 30fps: frame 30 == 1.0s → 24.0 native frames
    expect(mapFrameToLottie(30, VIDEO_FPS, 24, TOTAL)).toBeCloseTo(24, 6);
    // frame 5 == 5/30s → 24*(5/30) = 4.0
    expect(mapFrameToLottie(5, VIDEO_FPS, 24, TOTAL)).toBeCloseTo(4, 6);
    // frame 7 == 7/30s → 24*(7/30) = 5.6 (fractional)
    expect(mapFrameToLottie(7, VIDEO_FPS, 24, TOTAL)).toBeCloseTo(5.6, 6);
  });

  it("applies speed multiplier to time", () => {
    // speed 2 → twice the native frames for the same remotion frame
    expect(mapFrameToLottie(15, VIDEO_FPS, NATIVE_FPS, TOTAL, 2)).toBeCloseTo(30, 6);
    // speed 0.5 → half
    expect(mapFrameToLottie(30, VIDEO_FPS, NATIVE_FPS, TOTAL, 0.5)).toBeCloseTo(15, 6);
  });

  it("returns 0 for degenerate inputs (pre-load / zero fps)", () => {
    expect(mapFrameToLottie(10, VIDEO_FPS, 0, TOTAL)).toBe(0);
    expect(mapFrameToLottie(10, VIDEO_FPS, NATIVE_FPS, 0)).toBe(0);
    expect(mapFrameToLottie(10, 0, NATIVE_FPS, TOTAL)).toBe(0);
  });

  it("is a pure function — same inputs, same output", () => {
    const a = mapFrameToLottie(23, VIDEO_FPS, NATIVE_FPS, TOTAL, 1.3);
    const b = mapFrameToLottie(23, VIDEO_FPS, NATIVE_FPS, TOTAL, 1.3);
    expect(a).toBe(b);
  });
});
