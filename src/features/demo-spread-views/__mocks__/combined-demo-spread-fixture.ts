// __mocks__/combined-demo-spread-fixture.ts
// MOTION-PATH test spread: read-along textbox + video + webp auto_pic + dotLottie
// auto_pic, all VISIBLE from frame 0. ALL other animations are dropped (no
// read-along, no video fade/play, no camera, no exits). Each item travels along a
// LINES motion path to an absolute target position, one after another. NOTE: ARCS
// (17) is deprecated and falls back to LINES at runtime, so we use LINES (16).
//
// effect.geometry = ABSOLUTE target position (%); the tween builder converts it to
// a delta (target − item origin) × container size. Item origins (from the source
// fixtures): textbox(70,13) · video(4,30) · webp(37,30) · lottie(68,30). cw/ch in
// the tween builder are container-first → render-safe.

import type { PlayableSpread } from "@/types/playable-types";
import type { SpreadAnimation } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import { createReadAlongSpread } from "./read-along-spread-fixture";
import { createMediaItemsSpread } from "./media-items-spread-fixture";

// Per-item LINES motion path. `geometry` is the ABSOLUTE destination (%); w/h are
// required by the Geometry type but unused by the path (only x/y drive the delta).
// Hardcoded ids kept in sync with the source fixtures (validated by the guard).
const MOTION_TARGETS: Array<{
  id: string;
  type: SpreadAnimation["target"]["type"];
  effect: SpreadAnimation["effect"];
}> = [
  // textbox (70,13) → slide left across the top to (10,13)
  { id: "a287ac3b-dff7-4128-9ac9-70440b9b7a8a", type: "textbox", effect: { type: EFFECT_TYPE.LINES, duration: 1000, geometry: { x: 10, y: 13, w: 24, h: 13 } } },
  // video (4,30) → slide right to (60,30)
  { id: "fixture-video-0001", type: "video", effect: { type: EFFECT_TYPE.LINES, duration: 1000, geometry: { x: 60, y: 30, w: 28, h: 38 } } },
  // webp (37,30) → slide down to (37,75)
  { id: "fixture-webp-0001", type: "auto_pic", effect: { type: EFFECT_TYPE.LINES, duration: 1000, geometry: { x: 37, y: 75, w: 26, h: 38 } } },
  // lottie (68,30) → travel diagonally down-left to (10,60)
  { id: "fixture-lottie-0001", type: "auto_pic", effect: { type: EFFECT_TYPE.LINES, duration: 1000, geometry: { x: 10, y: 60, w: 28, h: 38 } } },
];

export function createCombinedDemoSpread(): PlayableSpread {
  const ra = createReadAlongSpread();
  const media = createMediaItemsSpread();

  const knownIds = new Set<string>([
    ...ra.textboxes.map((t) => t.id),
    ...(media.videos ?? []).map((v) => v.id),
    ...(media.auto_pics ?? []).map((p) => p.id),
  ]);
  for (const t of MOTION_TARGETS) {
    if (!knownIds.has(t.id)) {
      throw new Error(
        `[combined-demo-spread] motion target id "${t.id}" not found in source fixtures — update MOTION_TARGETS.`
      );
    }
  }

  const motionAnims: SpreadAnimation[] = MOTION_TARGETS.map((t) => ({
    type: 0,
    order: 0,
    effect: { delay: 0, ...t.effect },
    target: { id: t.id, type: t.type },
    trigger_type: "after_previous",
  }));

  // ONLY motion paths — read-along / video PLAY / camera / exits intentionally
  // dropped. Items render visible from frame 0 (motion initial state = visible);
  // they travel one after another. First animation keeps on_next; rest after_previous.
  const animations: SpreadAnimation[] = motionAnims.map((a, i) => ({
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
