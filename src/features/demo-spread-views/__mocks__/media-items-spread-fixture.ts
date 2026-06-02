// __mocks__/media-items-spread-fixture.ts
// Fixed media-items fixture for the Remotion spike: a video (PLAY animation), an
// animated WebP auto_pic, and a dotLottie auto_pic. Tests which media types are
// frame-deterministic under Remotion:
//   - video      → Remotion <OffthreadVideo> (frame-synced, deterministic) ✓
//   - webp       → Remotion <Img> (browser-animated, NOT frame-synced) — preview only
//   - .lottie    → DotLottieReact (rAF-driven, NOT frame-synced) — preview only
// Each item also gets a FADE_IN entrance (GSAP, seek-safe) to confirm motion + media
// compose on the same animated container.

import type { PlayableSpread } from "@/types/playable-types";
import type { SpreadVideo, SpreadAutoPic, SpreadAnimation } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";

const VIDEO_ID = "fixture-video-0001";
const WEBP_ID = "fixture-webp-0001";
const LOTTIE_ID = "fixture-lottie-0001";

const WEBP_URL =
  "https://kiprvibenjkhvzekbkrw.supabase.co/storage/v1/object/public/storybook-assets/auto-pics/1778122438393-dailyfina-cloud-22006-webp.webp";
const LOTTIE_URL =
  "https://kiprvibenjkhvzekbkrw.supabase.co/storage/v1/object/public/storybook-assets/auto-pics/1777548877878-bored-leela-swing-v2.lottie";
const VIDEO_URL = "https://www.w3schools.com/tags/mov_bbb.mp4";

const video: SpreadVideo = {
  id: VIDEO_ID,
  title: "Demo video",
  geometry: { x: 4, y: 30, w: 28, h: 38 },
  "z-index": 200,
  player_visible: true,
  editor_visible: true,
  media_url: VIDEO_URL,
};

const webpPic: SpreadAutoPic = {
  id: WEBP_ID,
  title: "Demo animated WebP",
  geometry: { x: 37, y: 30, w: 26, h: 38 },
  "z-index": 210,
  player_visible: true,
  editor_visible: true,
  media_url: WEBP_URL,
};

const lottiePic: SpreadAutoPic = {
  id: LOTTIE_ID,
  title: "Demo dotLottie",
  geometry: { x: 68, y: 30, w: 28, h: 38 },
  "z-index": 220,
  player_visible: true,
  editor_visible: true,
  media_url: LOTTIE_URL,
};

const animations: SpreadAnimation[] = [
  // video: fade in → play
  { type: 0, order: 0, effect: { type: EFFECT_TYPE.FADE_IN, duration: 800, delay: 0 }, target: { id: VIDEO_ID, type: "video" }, trigger_type: "on_next" },
  { type: 0, order: 1, effect: { type: EFFECT_TYPE.PLAY, duration: 8000 }, target: { id: VIDEO_ID, type: "video" }, trigger_type: "after_previous" },
  // webp auto_pic: fade in
  { type: 0, order: 2, effect: { type: EFFECT_TYPE.FADE_IN, duration: 800, delay: 0 }, target: { id: WEBP_ID, type: "auto_pic" }, trigger_type: "after_previous" },
  // lottie auto_pic: fade in
  { type: 0, order: 3, effect: { type: EFFECT_TYPE.FADE_IN, duration: 800, delay: 0 }, target: { id: LOTTIE_ID, type: "auto_pic" }, trigger_type: "after_previous" },
];

/** Single spread with video + webp + lottie — media-type determinism test bed. */
export function createMediaItemsSpread(): PlayableSpread {
  return {
    id: "fixture-media-items-0001",
    pages: [{ number: "0-1", type: "normal_page", layout: null, background: { color: "#FFFFFF", texture: null } }],
    images: [],
    textboxes: [],
    shapes: [],
    videos: [video],
    auto_pics: [webpPic, lottiePic],
    audios: [],
    quizzes: [],
    animations,
    manuscript: "Media items: video / webp / lottie",
  };
}
