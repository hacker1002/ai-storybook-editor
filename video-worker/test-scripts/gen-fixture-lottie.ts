// video-worker/test-scripts/gen-fixture-lottie.ts
// Emits a MINIMAL lottie-only spread payload for the ThorVG parity/determinism test — a
// single dotLottie auto_pic + one FADE_IN so the timeline has real (non-pad) frames. Kept
// separate from combined-spread.json so the per-frame ThorVG gate is isolated from
// video/webp/read-along variables. Relies on tsx resolving `@/*` from tsconfig.json.

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PlayableSpread } from "@/types/playable-types";
import type { SpreadAutoPic, SpreadAnimation } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";

const LOTTIE_ID = "fixture-lottie-0001";
const LOTTIE_URL =
  "https://kiprvibenjkhvzekbkrw.supabase.co/storage/v1/object/public/storybook-assets/auto-pics/1777548877878-bored-leela-swing-v2.lottie";

const lottiePic: SpreadAutoPic = {
  id: LOTTIE_ID,
  title: "Demo dotLottie",
  geometry: { x: 20, y: 20, w: 60, h: 60 },
  "z-index": 210,
  player_visible: true,
  editor_visible: true,
  media_url: LOTTIE_URL,
};

const animations: SpreadAnimation[] = [
  {
    type: 0,
    order: 0,
    effect: { type: EFFECT_TYPE.FADE_IN, duration: 800, delay: 0 },
    target: { id: LOTTIE_ID, type: "auto_pic" },
    trigger_type: "on_next",
  },
];

const spread: PlayableSpread = {
  id: "fixture-lottie-only-0001",
  pages: [
    {
      number: "0-1",
      type: "normal_page",
      layout: null,
      background: { color: "#FFFFFF", texture: null },
    },
  ],
  images: [],
  textboxes: [],
  shapes: [],
  videos: [],
  auto_pics: [lottiePic],
  audios: [],
  quizzes: [],
  animations,
  manuscript: "Lottie-only: ThorVG parity test bed",
};

const here = path.dirname(fileURLToPath(import.meta.url));
const payload = { spread, language: "en_US" };
const outDir = path.join(here, "fixtures");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "spread-lottie.json");
writeFileSync(outFile, JSON.stringify(payload, null, 2));
console.log(`wrote ${outFile} — ${spread.auto_pics.length} auto_pic(s), id=${spread.id}`);
