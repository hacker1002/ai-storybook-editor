// build-master-timeline.test.ts — non-geometry unit coverage (Validation S1).
// The geometry-dependent identity gate (buildMasterTimeline === buildAndPlayFullTimeline
// on real refs) runs as a dev-harness runtime check on the demo page, NOT here —
// jsdom null-refs make camera/composite tweens skip and would give a false identical.
// These tests cover the parts that don't depend on a mounted DOM: the linearize
// delay model + the render/live-auto quiz toggle.

import { describe, it, expect, vi } from "vitest";
import type { SpreadAnimation } from "@/types/spread-types";

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import {
  linearizeSpreadTimeline,
  TRIGGER_DELAY,
} from "./linearize-spread-timeline";
import { buildMasterTimeline } from "./build-master-timeline";
import type { BuildMasterTimelineArgs } from "./play-clock";

const PLAY = 1;
const FADE_IN = 3;

function anim(
  order: number,
  trigger: SpreadAnimation["trigger_type"],
  targetId: string,
  targetType: SpreadAnimation["target"]["type"] = "image",
  effectType = FADE_IN,
  duration?: number
): SpreadAnimation {
  return {
    order,
    type: 0,
    target: { id: targetId, type: targetType },
    trigger_type: trigger,
    effect: { type: effectType, ...(duration !== undefined ? { duration } : {}) },
  };
}

describe("linearizeSpreadTimeline — delay model mirrors buildMasterTimeline", () => {
  it("first anim starts at 0", () => {
    const { steps } = linearizeSpreadTimeline([anim(1, "on_next", "a", "image", FADE_IN, 500)]);
    expect(steps[0].startSec).toBe(0);
    expect(steps[0].position).toBe(0);
  });

  it("on_click/on_next chains with ON_CLICK_AUTO pacing gap", () => {
    const { steps } = linearizeSpreadTimeline([
      anim(1, "on_next", "a", "image", FADE_IN, 500), // 0 → ends 0.5
      anim(2, "on_next", "b", "image", FADE_IN, 500), // 0.5 + 1.0 gap = 1.5
    ]);
    expect(steps[1].startSec).toBeCloseTo(0.5 + TRIGGER_DELAY.ON_CLICK_AUTO, 5);
    expect(steps[1].position).toBe(">");
  });

  it("after_previous chains with no extra gap", () => {
    const { steps } = linearizeSpreadTimeline([
      anim(1, "on_next", "a", "image", FADE_IN, 500),
      anim(2, "after_previous", "b", "image", FADE_IN, 500),
    ]);
    expect(steps[1].startSec).toBeCloseTo(0.5 + TRIGGER_DELAY.AFTER_PREVIOUS, 5);
  });

  it("with_previous shares the previous start", () => {
    const { steps } = linearizeSpreadTimeline([
      anim(1, "on_next", "a", "image", FADE_IN, 500),
      anim(2, "with_previous", "b", "image", FADE_IN, 500),
    ]);
    expect(steps[1].startSec).toBe(steps[0].startSec);
    expect(steps[1].position).toBe("<");
  });
});

function baseArgs(
  animations: SpreadAnimation[],
  mode: BuildMasterTimelineArgs["mode"],
  extra: Partial<BuildMasterTimelineArgs> = {}
): BuildMasterTimelineArgs {
  return {
    animations,
    refsMap: new Map(),
    container: null,
    containerWidth: 800,
    containerHeight: 600,
    canvasWidth: 800,
    canvasHeight: 600,
    composites: undefined,
    textboxes: undefined,
    audios: undefined,
    narrationLangCode: "en_US",
    playEdition: "interactive",
    findItemGeometry: () => undefined,
    mode,
    ...extra,
  };
}

describe("buildMasterTimeline — quiz mode toggle (no geometry)", () => {
  const quizAnim = anim(1, "on_next", "quiz1", "quiz", PLAY); // PLAY, no duration → 3s default

  it("render mode → quiz becomes a duration spacer (no pause, no side-effects)", () => {
    const onQuizPlay = vi.fn();
    const tl = buildMasterTimeline(
      baseArgs([quizAnim], "render", { onQuizPlay })
    );
    expect(tl.paused()).toBe(true);
    // spacer = DEFAULT_PLAY_DURATION_SEC (3s) since quiz PLAY has no effect.duration
    expect(tl.duration()).toBeCloseTo(3, 5);
    // render never wires interactive callbacks
    expect(onQuizPlay).not.toHaveBeenCalled();
    tl.kill();
  });

  it("live-auto mode → quiz uses addPause (near-zero visible duration)", () => {
    const tl = buildMasterTimeline(
      baseArgs([quizAnim], "live-auto", {
        onQuizPlay: vi.fn(),
        setQuizActiveOrder: vi.fn(),
      })
    );
    expect(tl.paused()).toBe(true);
    // call + addPause + resume-offset call: no 3s spacer, just the +0.01 offset
    expect(tl.duration()).toBeLessThan(0.5);
    tl.kill();
  });
});
