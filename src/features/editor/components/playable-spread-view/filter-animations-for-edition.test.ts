// filter-animations-for-edition.test.ts — the SINGLE edition-filter seam shared by
// the live player (PlayerCanvas) AND the Remotion video render (BookSpreadCore +
// duration/audio builders). If these diverge, classic/dynamic render wrong.
//
//   • classic     → only READ_ALONG narration (static items, no motion)
//   • dynamic     → drop on_click chains (auto-play only)
//   • interactive → identity (everything)

import { describe, it, expect, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import type { SpreadAnimation } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import { filterAnimationsForEdition } from "./player-utils";

function anim(
  order: number,
  effectType: number,
  trigger: SpreadAnimation["trigger_type"],
  targetType: SpreadAnimation["target"]["type"] = "image"
): SpreadAnimation {
  return {
    type: 0,
    order,
    effect: { type: effectType, delay: 0, duration: 500 },
    target: { id: `t${order}`, type: targetType },
    trigger_type: trigger,
  } as SpreadAnimation;
}

/** order0 READ_ALONG, order1 entrance, order2 on_click PLAY + order3 chained SPIN,
 *  order4 fresh on_next (resets the click group). */
function mixed(): SpreadAnimation[] {
  return [
    anim(0, EFFECT_TYPE.READ_ALONG, "on_next", "textbox"),
    anim(1, EFFECT_TYPE.FADE_IN, "on_next"),
    anim(2, EFFECT_TYPE.PLAY, "on_click", "audio"),
    anim(3, EFFECT_TYPE.SPIN, "with_previous"),
    anim(4, EFFECT_TYPE.APPEAR, "on_next"),
  ];
}

describe("filterAnimationsForEdition", () => {
  it("classic → keeps ONLY read-along narration", () => {
    const out = filterAnimationsForEdition(mixed(), "classic");
    expect(out.map((a) => a.order)).toEqual([0]);
    expect(out.every((a) => a.effect.type === EFFECT_TYPE.READ_ALONG)).toBe(true);
  });

  it("dynamic → drops the on_click anim AND its chained follower, keeps the rest", () => {
    const out = filterAnimationsForEdition(mixed(), "dynamic");
    // order 2 (on_click) + order 3 (with_previous chained) removed; 0,1,4 kept.
    expect(out.map((a) => a.order)).toEqual([0, 1, 4]);
  });

  it("interactive → identity (every animation kept)", () => {
    const src = mixed();
    const out = filterAnimationsForEdition(src, "interactive");
    expect(out.map((a) => a.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("classic on a spread with no read-along → empty (fully static)", () => {
    const noNarration = mixed().filter((a) => a.effect.type !== EFFECT_TYPE.READ_ALONG);
    expect(filterAnimationsForEdition(noNarration, "classic")).toEqual([]);
  });

  it("classic ⊆ dynamic ⊆ interactive (monotonic by inclusion)", () => {
    const src = mixed();
    const classic = filterAnimationsForEdition(src, "classic").length;
    const dynamic = filterAnimationsForEdition(src, "dynamic").length;
    const interactive = filterAnimationsForEdition(src, "interactive").length;
    expect(classic).toBeLessThan(dynamic);
    expect(dynamic).toBeLessThan(interactive);
  });
});
