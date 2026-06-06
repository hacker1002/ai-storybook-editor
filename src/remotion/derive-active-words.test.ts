// derive-active-words.test.ts — frame → active read-along word index (ADR-035 Phase 05).

import { describe, it, expect, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { createReadAlongSpread } from "@/features/demo-spread-views/__mocks__/read-along-spread-fixture";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import type { PlayableSpread } from "@/types/playable-types";
import { deriveActiveWords } from "./derive-active-words";

const FPS = 30;
const spread = createReadAlongSpread();
const TB_ID = spread.textboxes![0].id;
// EN word_timings: "School" 251-317, "is" 370-476, ... last word "fun!" ends 3437.

describe("deriveActiveWords", () => {
  it("no active word before the first word starts (frame 0)", () => {
    const map = deriveActiveWords(0, spread, FPS, "en_US", "interactive");
    expect(map[TB_ID]).toBe(-1);
  });

  it("highlights the latest elapsed word mid-narration", () => {
    // frame 10 @30fps = 333ms → 'School' (251) elapsed, 'is' (370) not yet → idx 0
    const map = deriveActiveWords(10, spread, FPS, "en_US", "interactive");
    expect(map[TB_ID]).toBe(0);
  });

  it("advances as more words elapse", () => {
    // frame 15 = 500ms → 'School'(251),'is'(370) elapsed, 'closed.'(567) not → idx 1
    const map = deriveActiveWords(15, spread, FPS, "en_US", "interactive");
    expect(map[TB_ID]).toBe(1);
  });

  it("clears the highlight after the last word ends", () => {
    // frame 200 = 6666ms > last endMs (3437) → cleared
    const map = deriveActiveWords(200, spread, FPS, "en_US", "interactive");
    expect(map[TB_ID]).toBe(-1);
  });
});

describe("deriveActiveWords — edition filtering (G1 parity)", () => {
  // Spread with a FADE_IN entrance BEFORE the read-along. The entrance is dropped
  // for classic (read-along-only) but kept for interactive → the read-along step's
  // linearized startSec differs between editions (classic 0s vs interactive 1.5s:
  // entrance 0.5s dur + ON_CLICK_AUTO 1.0s gap). word_timings are relative to that
  // startSec, so the active-word index at the same frame MUST differ.
  function spreadWithEntranceBeforeReadAlong(): PlayableSpread {
    const base = createReadAlongSpread();
    return {
      ...base,
      animations: [
        {
          type: 0,
          order: 0,
          effect: { type: EFFECT_TYPE.FADE_IN, delay: 0, duration: 500 },
          target: { id: TB_ID, type: "textbox" },
          trigger_type: "on_next",
        },
        {
          type: 0,
          order: 1,
          effect: { type: EFFECT_TYPE.READ_ALONG, delay: 0, duration: 3200 },
          target: { id: TB_ID, type: "textbox" },
          trigger_type: "on_next",
        },
      ],
    };
  }

  const drift = spreadWithEntranceBeforeReadAlong();

  it("classic ignores the entrance → read-along starts at 0s (highlight tracks audio)", () => {
    // frame 10 = 333ms; classic read-along startSec=0 → relMs 333 → 'School' elapsed → idx 0
    const map = deriveActiveWords(10, drift, FPS, "en_US", "classic");
    expect(map[TB_ID]).toBe(0);
  });

  it("interactive counts the entrance gap → read-along still pending at the same frame", () => {
    // interactive read-along startSec=1.5s → relMs(333-1500) < 0 → no word yet → idx -1
    const map = deriveActiveWords(10, drift, FPS, "en_US", "interactive");
    expect(map[TB_ID]).toBe(-1);
  });

  it("classic vs interactive diverge at the same frame (the drift the filter fixes)", () => {
    const classic = deriveActiveWords(10, drift, FPS, "en_US", "classic");
    const interactive = deriveActiveWords(10, drift, FPS, "en_US", "interactive");
    expect(classic[TB_ID]).not.toBe(interactive[TB_ID]);
  });
});
