// remotion/book-video-composition.tsx — the full-book mega composition (design
// 06-book-render.md §3-9). One frame clock; spread-segments and turn-segments are
// stitched as sequential <Sequence>s on the book frame axis. Remotion culls
// off-window <Sequence>s, so peak DOM stays ~1-2 active spreads regardless of
// book length (no manual chunking inside the composition — the WORKER renders
// chunked frameRanges via plan-chunks).
//
//   • Spread-segment → BookSpreadSegment (anim → settle hold).
//   • Turn-segment   → BookTurnSegment (frozen flip, silent).
//   • Per-spread audio (0:a, committed v1) → re-emitted at the spread-segment's
//     book-level frame offset. Transition windows carry NO audio.
//
// BGM is NOT an input here — it is book-level and muxed post-concat at the worker
// (phase 03). This composition is BGM-agnostic by design.

import { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import type { PlayableSpread } from "@/types/playable-types";
import type { Section } from "@/types/illustration-types";
import type { RemixLanguageCode } from "@/types/editor";
import { createLogger } from "@/utils/logger";
import { resolveBookSequence } from "@/features/editor/components/playable-spread-view/resolve-book-sequence";
import { VIDEO_FPS, type ResolutionKey } from "./composition-metadata";
import { buildBookSegmentLayout } from "./book-segment-layout";
import { buildSpreadAudioSequences } from "./build-spread-audio-sequences";
import { BookSpreadSegment } from "./book-spread-segment";
import { BookTurnSegment } from "./book-turn-segment";

const log = createLogger("Remotion", "BookVideoComposition");

// Type alias (not interface): Remotion <Composition> props must satisfy
// `Record<string, unknown>` (interfaces lack the implicit index signature).
export type BookVideoInputProps = {
  spreads: PlayableSpread[];
  sections?: Section[];
  edition: "classic" | "dynamic";
  language: RemixLanguageCode;
  startSpreadId?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  resolution: ResolutionKey;
};

export function BookVideoComposition({
  spreads,
  sections,
  edition,
  language,
  startSpreadId,
  canvasWidth,
}: BookVideoInputProps) {
  // Resolve the SAME sequence calculateMetadata used (same props) → no drift.
  const sequence = useMemo(
    () => resolveBookSequence(spreads, sections, { startSpreadId, edition }),
    [spreads, sections, startSpreadId, edition]
  );

  const layout = useMemo(() => buildBookSegmentLayout(sequence, VIDEO_FPS), [sequence]);

  // Per-spread audio at book-level offsets. Built once per spread-segment from the
  // segment's startFrame so audio never overlaps the previous settle or the silent
  // transition that follows (offsets compose by a single addition — see helper).
  const audioSequences = useMemo(() => {
    const out: ReturnType<typeof buildSpreadAudioSequences> = [];
    for (const seg of layout.segments) {
      if (seg.kind !== "spread") continue;
      out.push(...buildSpreadAudioSequences(seg.spread, language, VIDEO_FPS, seg.startFrame));
    }
    return out;
  }, [layout, language]);

  log.info("render", "book composition layout", {
    spreads: sequence.ordered.length,
    segments: layout.segments.length,
    totalFrames: layout.totalFrames,
    audioCount: audioSequences.length,
    truncatedByCycle: sequence.truncatedByCycle,
    truncatedByCap: sequence.truncatedByCap,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff" }}>
      {layout.segments.map((seg) =>
        seg.kind === "spread" ? (
          <Sequence
            key={`spread-${seg.orderIndex}`}
            from={seg.startFrame}
            durationInFrames={seg.durationFrames}
          >
            <BookSpreadSegment
              spread={seg.spread}
              language={language}
              canvasWidth={canvasWidth}
              totalSec={seg.totalSec}
              animFrames={seg.animFrames}
            />
          </Sequence>
        ) : (
          <Sequence
            key={`turn-${seg.fromOrderIndex}`}
            from={seg.startFrame}
            durationInFrames={seg.durationFrames}
          >
            <BookTurnSegment
              fromSpread={seg.fromSpread}
              fromTotalSec={seg.fromTotalSec}
              toSpread={seg.toSpread}
              language={language}
              canvasWidth={canvasWidth}
              transitionFrames={seg.durationFrames}
            />
          </Sequence>
        )
      )}

      {/* Per-spread audio (0:a). Each <Audio> sits in its own <Sequence from> at the
          book-level frame; transition windows have none → silent by construction. */}
      {audioSequences.map((a) => (
        <Sequence key={a.key} from={a.from}>
          <Audio src={a.url} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
