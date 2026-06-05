// book-audio-offsets.test.ts — verifies the phase-02 audio-offset invariant
// (design 06 §9.1, committed v1 0:a). The per-spread <Audio> offsets are the main
// risk of this phase: they must (a) land at segmentStartFrame + round(startSec*fps),
// (b) never fall inside a transition window (transition is SILENT), and (c) never
// drift/overlap between adjacent spreads.
//
// This is the deterministic stand-in for the "probe the output audio track" check —
// it asserts the exact frame each <Audio> is emitted at without a browser render.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import type { PlayableSpread } from "@/types/playable-types";
import { createReadAlongSpread } from "@/features/demo-spread-views/__mocks__/read-along-spread-fixture";
import { buildBookSegmentLayout, type BookLayoutSequence } from "./book-segment-layout";
import { buildSpreadAudioSequences } from "./build-spread-audio-sequences";
import { VIDEO_FPS } from "./composition-metadata";

function cloneWithId(id: string): PlayableSpread {
  return { ...createReadAlongSpread(), id };
}

/** 3-spread linear book, each spread carries one READ_ALONG narration audio. */
function bookSequence(): BookLayoutSequence {
  return {
    ordered: [
      { spread: cloneWithId("a"), turnToNext: "next" },
      { spread: cloneWithId("b"), turnToNext: "next" },
      { spread: cloneWithId("c"), turnToNext: null },
    ],
  };
}

/** Re-emit audio for each spread-segment at its book-level offset (== composition). */
function allBookAudio(seq: BookLayoutSequence) {
  const layout = buildBookSegmentLayout(seq, VIDEO_FPS);
  const audio = [];
  for (const seg of layout.segments) {
    if (seg.kind !== "spread") continue;
    for (const a of buildSpreadAudioSequences(seg.spread, "en_US", VIDEO_FPS, seg.startFrame)) {
      audio.push({ ...a, segStart: seg.startFrame, segIndex: seg.orderIndex });
    }
  }
  return { layout, audio };
}

describe("book per-spread audio offsets", () => {
  it("output has at least one audio leaf per spread (0:a present)", () => {
    const { audio } = allBookAudio(bookSequence());
    // 3 spreads × 1 READ_ALONG narration each.
    expect(audio.length).toBe(3);
  });

  it("each audio starts at segmentStartFrame + round(startSec*fps)", () => {
    const { audio } = allBookAudio(bookSequence());
    for (const a of audio) {
      // standalone (offset 0) start for the same spread:
      const local = buildSpreadAudioSequences(
        createReadAlongSpread(),
        "en_US",
        VIDEO_FPS,
        0
      )[0];
      expect(a.from).toBe(a.segStart + local.from);
    }
  });

  it("no audio leaf falls inside a transition (flip) window — transitions are silent", () => {
    const { layout, audio } = allBookAudio(bookSequence());
    const turnWindows = layout.segments
      .filter((s) => s.kind === "turn")
      .map((s) => [s.startFrame, s.startFrame + s.durationFrames] as const);
    for (const a of audio) {
      for (const [start, end] of turnWindows) {
        expect(a.from >= start && a.from < end).toBe(false);
      }
    }
  });

  it("adjacent spreads' audio do not overlap (offsets strictly increase by spread)", () => {
    const { audio } = allBookAudio(bookSequence());
    const byIndex = [...audio].sort((x, y) => x.segIndex - y.segIndex);
    for (let i = 1; i < byIndex.length; i++) {
      // each later spread's audio starts strictly after the previous spread's.
      expect(byIndex[i].from).toBeGreaterThan(byIndex[i - 1].from);
    }
  });

  it("every audio sits within its own spread-segment window (no spill into settle/next)", () => {
    const { layout, audio } = allBookAudio(bookSequence());
    const spreadWindows = new Map(
      layout.segments
        .filter((s) => s.kind === "spread")
        .map((s) => [s.orderIndex, [s.startFrame, s.startFrame + s.durationFrames] as const])
    );
    for (const a of audio) {
      const [start, end] = spreadWindows.get(a.segIndex)!;
      expect(a.from).toBeGreaterThanOrEqual(start);
      expect(a.from).toBeLessThan(end);
    }
  });
});
