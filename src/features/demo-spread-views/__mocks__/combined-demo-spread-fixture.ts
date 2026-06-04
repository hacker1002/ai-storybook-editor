// __mocks__/combined-demo-spread-fixture.ts
// Single spread combining all spike media demos: read-along textbox + video (PLAY)
// + animated webp auto_pic + dotLottie auto_pic. Reuses the two source fixtures as
// building blocks (DRY) and chains every item sequentially (after_previous) so they
// appear one after another: fly-in entrances → read-along → video (fade + play)
// → webp → lottie. FLY_IN directions chosen from item geometry so each item enters
// from its nearest viewport edge.

import type { PlayableSpread } from "@/types/playable-types";
import type { SpreadAnimation } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import { createReadAlongSpread } from "./read-along-spread-fixture";
import { createMediaItemsSpread } from "./media-items-spread-fixture";

const FLY_IN_DURATION_MS = 600;

// Hardcoded target IDs — kept in sync with the source fixtures. If a source
// fixture renames an id, the matching entry here must be updated (validated by
// the `assertTargetExists` guard below — fails loudly in dev/test).
const FLY_IN_TARGETS: Array<{
  id: string;
  type: SpreadAnimation["target"]["type"];
  direction: "left" | "right" | "up" | "down";
}> = [
  { id: "a287ac3b-dff7-4128-9ac9-70440b9b7a8a", type: "textbox", direction: "right" }, // read-along textbox (right side)
  // video intentionally excluded — keeps its original FADE_IN → PLAY chain.
  { id: "fixture-webp-0001", type: "auto_pic", direction: "up" },                       // webp (center)
  { id: "fixture-lottie-0001", type: "auto_pic", direction: "right" },                  // lottie (right column)
];

export function createCombinedDemoSpread(): PlayableSpread {
  const ra = createReadAlongSpread();
  const media = createMediaItemsSpread();

  const knownIds = new Set<string>([
    ...ra.textboxes.map((t) => t.id),
    ...(media.videos ?? []).map((v) => v.id),
    ...(media.auto_pics ?? []).map((p) => p.id),
  ]);
  for (const t of FLY_IN_TARGETS) {
    if (!knownIds.has(t.id)) {
      throw new Error(
        `[combined-demo-spread] FLY_IN target id "${t.id}" not found in source fixtures — update FLY_IN_TARGETS.`
      );
    }
  }

  const flyInEntrances: SpreadAnimation[] = FLY_IN_TARGETS.map((t) => ({
    type: 0,
    order: 0,
    effect: {
      type: EFFECT_TYPE.FLY_IN,
      direction: t.direction,
      duration: FLY_IN_DURATION_MS,
      delay: 0,
    },
    target: { id: t.id, type: t.type },
    trigger_type: "after_previous",
  }));

  // Sequential reveal: fly-in entrances first, then the original chain. First
  // animation keeps its source trigger (on_next), everything after chains via
  // after_previous so the whole spread plays as one auto-stepped sequence.
  const animations: SpreadAnimation[] = [
    ...flyInEntrances,
    ...ra.animations,
    ...media.animations,
  ].map((a, i) => ({
    ...a,
    order: i,
    trigger_type: i === 0 ? "on_next" : "after_previous",
  }));

  return {
    id: "fixture-combined-0001",
    pages: ra.pages,
    images: [],
    textboxes: ra.textboxes,
    shapes: [],
    videos: media.videos,
    auto_pics: media.auto_pics,
    audios: [],
    quizzes: [],
    animations,
    manuscript: "Combined: read-along + video + webp + lottie",
  };
}
