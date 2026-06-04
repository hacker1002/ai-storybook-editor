// derive-active-words.test.ts — frame → active read-along word index (ADR-035 Phase 05).

import { describe, it, expect, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { createReadAlongSpread } from "@/features/demo-spread-views/__mocks__/read-along-spread-fixture";
import { deriveActiveWords } from "./derive-active-words";

const FPS = 30;
const spread = createReadAlongSpread();
const TB_ID = spread.textboxes![0].id;
// EN word_timings: "School" 251-317, "is" 370-476, ... last word "fun!" ends 3437.

describe("deriveActiveWords", () => {
  it("no active word before the first word starts (frame 0)", () => {
    const map = deriveActiveWords(0, spread, FPS, "en_US");
    expect(map[TB_ID]).toBe(-1);
  });

  it("highlights the latest elapsed word mid-narration", () => {
    // frame 10 @30fps = 333ms → 'School' (251) elapsed, 'is' (370) not yet → idx 0
    const map = deriveActiveWords(10, spread, FPS, "en_US");
    expect(map[TB_ID]).toBe(0);
  });

  it("advances as more words elapse", () => {
    // frame 15 = 500ms → 'School'(251),'is'(370) elapsed, 'closed.'(567) not → idx 1
    const map = deriveActiveWords(15, spread, FPS, "en_US");
    expect(map[TB_ID]).toBe(1);
  });

  it("clears the highlight after the last word ends", () => {
    // frame 200 = 6666ms > last endMs (3437) → cleared
    const map = deriveActiveWords(200, spread, FPS, "en_US");
    expect(map[TB_ID]).toBe(-1);
  });
});
