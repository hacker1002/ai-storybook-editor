// __mocks__/combined-demo-spread-fixture.ts
// Single spread combining all spike media demos: read-along textbox + video (PLAY)
// + animated webp auto_pic + dotLottie auto_pic. Reuses the two source fixtures as
// building blocks (DRY) and chains every item sequentially (after_previous) so they
// appear one after another: read-along → video (fade + play) → webp → lottie.

import type { PlayableSpread } from "@/types/playable-types";
import type { SpreadAnimation } from "@/types/spread-types";
import { createReadAlongSpread } from "./read-along-spread-fixture";
import { createMediaItemsSpread } from "./media-items-spread-fixture";

export function createCombinedDemoSpread(): PlayableSpread {
  const ra = createReadAlongSpread();
  const media = createMediaItemsSpread();

  // Sequential reveal: first anim keeps its trigger (on_next), every following item
  // chains after the previous one finishes (after_previous).
  const animations: SpreadAnimation[] = [...ra.animations, ...media.animations].map(
    (a, i) => ({
      ...a,
      order: i,
      trigger_type: i === 0 ? a.trigger_type : "after_previous",
    })
  );

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
