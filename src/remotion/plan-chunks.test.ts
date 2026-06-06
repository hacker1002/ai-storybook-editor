// plan-chunks.test.ts — proves the HARD invariant of planChunks (design 06 §7.1):
// every chunk boundary is TRANSITION-COMPLETE (end of a turn-segment, post-flip)
// or the composition end (endPad end) — NEVER mid-spread-segment or mid-flip.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import type { PlayableSpread } from "@/types/playable-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import {
  buildBookSegmentLayout,
  type BookLayoutSequence,
} from "./book-segment-layout";
import { planChunks } from "./plan-chunks";
import { VIDEO_FPS } from "./composition-metadata";

// ── Minimal spread with one timed animation so totalSec > 0 (deterministic). ──
function makeSpread(id: string, durationMs: number): PlayableSpread {
  return {
    id,
    pages: [],
    images: [],
    textboxes: [],
    shapes: [],
    videos: [],
    auto_pics: [],
    audios: [],
    quizzes: [],
    manuscript: "",
    animations: [
      {
        type: 0,
        order: 0,
        effect: { type: EFFECT_TYPE.LINES, duration: durationMs, delay: 0, geometry: { x: 10, y: 10, w: 10, h: 10 } },
        target: { id: "x", type: "image" },
        trigger_type: "on_next",
      },
    ],
  } as unknown as PlayableSpread;
}

/** Build a linear sequence of n spreads (each flips to the next, last has none). */
function linearSequence(n: number, durationMs = 1000): BookLayoutSequence {
  const ordered = Array.from({ length: n }, (_, i) => ({
    spread: makeSpread(`s${i}`, durationMs),
    turnToNext: (i < n - 1 ? "next" : null) as "next" | null,
  }));
  return { ordered };
}

/** Frame boundaries that are valid chunk ends: end of each turn-segment + totalFrames. */
function validBoundaries(seq: BookLayoutSequence): Set<number> {
  const layout = buildBookSegmentLayout(seq, VIDEO_FPS);
  const set = new Set<number>([layout.totalFrames]);
  for (const seg of layout.segments) {
    if (seg.kind === "turn") set.add(seg.startFrame + seg.durationFrames);
  }
  return set;
}

/** Open intervals (start, end) of every segment — a boundary must not fall inside. */
function openIntervals(seq: BookLayoutSequence): Array<[number, number]> {
  const layout = buildBookSegmentLayout(seq, VIDEO_FPS);
  return layout.segments.map((s) => [s.startFrame, s.startFrame + s.durationFrames]);
}

describe("planChunks", () => {
  it("covers [0, totalFrames) contiguously with no gaps or overlaps", () => {
    const seq = linearSequence(12);
    const total = buildBookSegmentLayout(seq, VIDEO_FPS).totalFrames;
    const chunks = planChunks(seq, VIDEO_FPS, "interactive", 5);

    expect(chunks[0].start).toBe(0);
    expect(chunks[chunks.length - 1].end).toBe(total);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].start).toBe(chunks[i - 1].end); // contiguous, no gap/overlap
      expect(chunks[i].end).toBeGreaterThan(chunks[i].start);
    }
  });

  it("every chunk end is transition-complete (turn-segment end) or composition end", () => {
    const seq = linearSequence(13);
    const valid = validBoundaries(seq);
    const chunks = planChunks(seq, VIDEO_FPS, "interactive", 5);
    for (const c of chunks) {
      expect(valid.has(c.end)).toBe(true);
    }
  });

  it("no chunk boundary falls mid-spread or mid-flip", () => {
    const seq = linearSequence(11);
    const intervals = openIntervals(seq);
    const chunks = planChunks(seq, VIDEO_FPS, "interactive", 4);
    const boundaries = chunks.flatMap((c) => [c.start, c.end]);
    for (const b of boundaries) {
      for (const [start, end] of intervals) {
        // boundary may equal a segment start or end, but never sit strictly inside.
        expect(b > start && b < end).toBe(false);
      }
    }
  });

  it("groups ~CHUNK_SPREADS spreads per chunk (count sanity)", () => {
    const seq = linearSequence(12);
    const chunks = planChunks(seq, VIDEO_FPS, "interactive", 5);
    // 12 spreads / 5 per chunk → 3 chunks (5 + 5 + 2). The flip out of each group's
    // last spread sits in that group's chunk tail.
    expect(chunks.length).toBe(3);
  });

  it("single-spread book → one chunk covering the whole composition", () => {
    const seq = linearSequence(1);
    const total = buildBookSegmentLayout(seq, VIDEO_FPS).totalFrames;
    const chunks = planChunks(seq, VIDEO_FPS, "interactive", 5);
    expect(chunks).toEqual([{ start: 0, end: total }]);
  });

  it("flip leading out of a chunk's last spread is at the TAIL of that chunk (not lost)", () => {
    // 6 spreads, group size 3 → chunk 0 = spreads 0,1,2 + flip 2→3; chunk 1 = rest.
    const seq = linearSequence(6);
    const layout = buildBookSegmentLayout(seq, VIDEO_FPS);
    const chunks = planChunks(seq, VIDEO_FPS, "interactive", 3);

    // The turn-segment between spread index 2 and 3:
    const turn2 = layout.segments.find(
      (s) => s.kind === "turn" && s.fromOrderIndex === 2
    )!;
    const turn2End = turn2.startFrame + turn2.durationFrames;
    // chunk 0 must END exactly at that flip's post-flip frame (flip in the tail).
    expect(chunks[0].end).toBe(turn2End);
  });

  it("chunker total === getBookDurationInFrames for the SAME edition (regression: classic vs interactive drift, bug 2026-06-06)", () => {
    // Reproduce the failure mode: composition uses `classic`, planChunks defaulted
    // to `interactive` → last chunk's `end` overran composition.durationInFrames
    // and Remotion threw "frame range … not inbetween 0-N".
    const seq = linearSequence(6);
    const classicTotal = buildBookSegmentLayout(seq, VIDEO_FPS, "classic").totalFrames;
    const interactiveTotal = buildBookSegmentLayout(seq, VIDEO_FPS, "interactive").totalFrames;
    // Sanity: classic filters animations → totalSec=0 per spread → strictly shorter.
    expect(classicTotal).toBeLessThan(interactiveTotal);

    const chunksClassic = planChunks(seq, VIDEO_FPS, "classic", 5);
    expect(chunksClassic[chunksClassic.length - 1].end).toBe(classicTotal);

    const chunksInteractive = planChunks(seq, VIDEO_FPS, "interactive", 5);
    expect(chunksInteractive[chunksInteractive.length - 1].end).toBe(interactiveTotal);
  });

  it("empty book → single chunk of the floored composition length", () => {
    const seq: BookLayoutSequence = { ordered: [] };
    const chunks = planChunks(seq, VIDEO_FPS, "interactive", 5);
    expect(chunks.length).toBe(1);
    expect(chunks[0].start).toBe(0);
    expect(chunks[0].end).toBeGreaterThanOrEqual(1);
  });
});
