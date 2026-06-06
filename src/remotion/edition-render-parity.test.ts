// edition-render-parity.test.ts — proves the video render now diverges by edition
// the SAME way the live player does (it previously hardcoded "interactive", so
// classic rendered identically to dynamic). Covers the two non-visual seams that a
// browser-less test can assert deterministically:
//   • DURATION — getSpreadTotalSec / buildBookSegmentLayout shrink for classic
//     (read-along only) vs dynamic vs interactive.
//   • AUDIO    — buildSpreadAudioSequences emits ONLY read-along narration for
//     classic (no PLAY sound-effects).
// The visual seam (BookSpreadCore passing the real edition to buildMasterTimeline +
// PlayerSpreadStage) is covered structurally by filter-animations-for-edition.test
// + build-master-timeline.test (playEdition behaviour).

import { describe, it, expect, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import type { PlayableSpread } from "@/types/playable-types";
import type { SpreadAnimation, SpreadAudio } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import { createReadAlongSpread } from "@/features/demo-spread-views/__mocks__/read-along-spread-fixture";
import { getSpreadTotalSec, VIDEO_FPS } from "./composition-metadata";
import { buildBookSegmentLayout, type BookLayoutSequence } from "./book-segment-layout";
import { buildSpreadAudioSequences } from "./build-spread-audio-sequences";

const SFX_URL = "https://example.test/sfx-pop.mp3";
const NARRATION_URL_FRAGMENT = "/narrations/"; // read-along combined_audio_url host

const SFX_AUDIO: SpreadAudio = {
  id: "sfx-1",
  geometry: { x: 0, y: 0, w: 5, h: 5 },
  "z-index": 1,
  player_visible: true,
  editor_visible: true,
  media_url: SFX_URL,
  media_length: 1000,
};

/** Read-along base + an entrance, a PLAY sound-effect, and an on_click chain — so
 *  the three editions resolve to materially different animation sets. */
function richSpread(): PlayableSpread {
  const base = createReadAlongSpread();
  const tbId = base.textboxes[0].id;
  const readAlong = base.animations[0]; // order 0, READ_ALONG, on_next

  const extra: SpreadAnimation[] = [
    {
      type: 0,
      order: 1,
      effect: { type: EFFECT_TYPE.FADE_IN, delay: 0, duration: 600 },
      target: { id: tbId, type: "textbox" },
      trigger_type: "after_previous",
    } as SpreadAnimation,
    {
      type: 0,
      order: 2,
      effect: { type: EFFECT_TYPE.PLAY, delay: 0, duration: 1000 },
      target: { id: SFX_AUDIO.id, type: "audio" },
      trigger_type: "after_previous",
    } as SpreadAnimation,
    {
      type: 0,
      order: 3,
      effect: { type: EFFECT_TYPE.SPIN, delay: 0, duration: 800 },
      target: { id: tbId, type: "textbox" },
      trigger_type: "on_click",
    } as SpreadAnimation,
  ];

  return { ...base, audios: [SFX_AUDIO], animations: [readAlong, ...extra] };
}

describe("edition render parity — duration", () => {
  it("classic totalSec counts ONLY read-along (< dynamic < interactive)", () => {
    const s = richSpread();
    const classic = getSpreadTotalSec(s, "classic");
    const dynamic = getSpreadTotalSec(s, "dynamic");
    const interactive = getSpreadTotalSec(s, "interactive");

    expect(classic).toBeGreaterThan(0); // read-along is ~3.2s
    expect(classic).toBeLessThan(dynamic); // dynamic adds entrance + sfx
    expect(dynamic).toBeLessThanOrEqual(interactive); // interactive adds the click chain
  });

  it("classic totalSec === a read-along-only spread (no leftover anim time)", () => {
    const readAlongOnly = createReadAlongSpread();
    expect(getSpreadTotalSec(richSpread(), "classic")).toBeCloseTo(
      getSpreadTotalSec(readAlongOnly, "interactive"),
      5
    );
  });

  it("book layout frames are shorter for classic than interactive", () => {
    const seq: BookLayoutSequence = {
      ordered: [
        { spread: richSpread(), turnToNext: "next" },
        { spread: richSpread(), turnToNext: null },
      ],
    };
    const classic = buildBookSegmentLayout(seq, VIDEO_FPS, "classic").totalFrames;
    const interactive = buildBookSegmentLayout(seq, VIDEO_FPS, "interactive").totalFrames;
    expect(classic).toBeLessThan(interactive);
  });
});

describe("edition render parity — audio", () => {
  it("classic emits ONLY read-along narration (no PLAY sound-effect)", () => {
    const audio = buildSpreadAudioSequences(richSpread(), "en_US", VIDEO_FPS, 0, "classic");
    expect(audio.length).toBe(1);
    expect(audio[0].url).toContain(NARRATION_URL_FRAGMENT);
    expect(audio.some((a) => a.url === SFX_URL)).toBe(false);
  });

  it("interactive emits BOTH the narration and the PLAY sound-effect", () => {
    const audio = buildSpreadAudioSequences(richSpread(), "en_US", VIDEO_FPS, 0, "interactive");
    const urls = audio.map((a) => a.url);
    expect(urls).toContain(SFX_URL);
    expect(urls.some((u) => u.includes(NARRATION_URL_FRAGMENT))).toBe(true);
  });

  it("default edition param (single-spread demo) stays interactive — sfx present", () => {
    const audio = buildSpreadAudioSequences(richSpread(), "en_US", VIDEO_FPS, 0);
    expect(audio.some((a) => a.url === SFX_URL)).toBe(true);
  });
});
