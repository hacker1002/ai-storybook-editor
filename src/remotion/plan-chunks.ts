// remotion/plan-chunks.ts — split the full-book frame axis into worker render
// chunks (design 06-book-render.md §7.1). Each chunk is a `{ start, end }` frame
// range [start, end) the worker renders independently (Remotion `frameRange`)
// then ffmpeg-concats.
//
// HARD INVARIANT (the reason this lives in its own tested module):
//   Every chunk's `end` is a TRANSITION-COMPLETE boundary — the frame just AFTER
//   a turn-segment's last frame (post-flip), or the very end of the composition
//   (endPad end). A chunk boundary NEVER falls mid-spread-segment or mid-flip.
//
// Why post-flip: a turn-segment renders BOTH the outgoing and incoming spread
// (frozen flip). Cutting after it means the flip leading OUT of a chunk's last
// spread sits at the TAIL of that chunk — no flip is ever split across two chunks,
// and the next chunk opens cleanly on the next spread-segment's t=0 (which the
// flip's back face already showed → seam matches).
//
// Grouping: ~CHUNK_SPREADS spread-segments per chunk. The final chunk also carries
// the endPad.

import type { PlayEdition } from "@/types/playable-types";
import type { BookLayoutSequence } from "./book-segment-layout";
import { buildBookSegmentLayout } from "./book-segment-layout";
import { CHUNK_SPREADS, VIDEO_FPS } from "./composition-metadata";

/** Half-open frame range [start, end) for one worker render chunk. */
export interface RenderChunk {
  start: number;
  end: number;
}

/**
 * Plan the worker render chunks for a resolved book sequence.
 *
 * @param sequence resolved book sequence (same one passed to the composition).
 * @param fps composition fps.
 * @param edition MUST match what the composition was selected with (classic vs
 *   interactive). Otherwise spread durations diverge from
 *   `getBookDurationInFrames` and the final chunk's `end` overruns the
 *   composition's `durationInFrames` (worker error 2026-06-06 on classic).
 * @param chunkSpreads target spreads per chunk (default CHUNK_SPREADS).
 * @returns ordered, contiguous, non-overlapping chunks covering [0, totalFrames).
 */
export function planChunks(
  sequence: BookLayoutSequence,
  fps = VIDEO_FPS,
  edition: PlayEdition = "interactive",
  chunkSpreads = CHUNK_SPREADS
): RenderChunk[] {
  const layout = buildBookSegmentLayout(sequence, fps, edition);
  const segments = layout.segments;

  // Empty book → single 1-frame chunk (composition is floored to 1 frame).
  if (segments.length === 0) {
    return [{ start: 0, end: layout.totalFrames }];
  }

  const groupSize = Math.max(1, Math.floor(chunkSpreads));

  const chunks: RenderChunk[] = [];
  let chunkStart = 0;
  let spreadsInChunk = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    if (seg.kind === "spread") {
      spreadsInChunk += 1;

      // Reached the group size: try to close the chunk AFTER the following
      // turn-segment (post-flip). If this spread is the last (no following turn),
      // the chunk closes at the end of the book below.
      if (spreadsInChunk >= groupSize) {
        const nextTurn = segments[i + 1];
        if (nextTurn && nextTurn.kind === "turn") {
          const end = nextTurn.startFrame + nextTurn.durationFrames; // post-flip
          chunks.push({ start: chunkStart, end });
          chunkStart = end;
          spreadsInChunk = 0;
          i += 1; // consume the turn-segment into THIS chunk's tail
        }
        // else: last spread (or malformed) → fall through; end-of-book cut below.
      }
    }
  }

  // Final chunk: everything remaining up to the composition end (includes endPad).
  if (chunkStart < layout.totalFrames) {
    chunks.push({ start: chunkStart, end: layout.totalFrames });
  }

  return chunks;
}
