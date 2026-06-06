// remotion/spread-video-composition.tsx — the render-mode entry for the shared
// player render core (ADR-035). Drives the SAME PlayerSpreadStage + the SAME
// buildMasterTimeline as the live player, but via a FrameSeek clock
// (tl.seek(frame/fps)) instead of wall-clock playback ⇒ preview === output by
// construction.
//
//   • mode:'render' → quiz = timing spacer (no pause), PLAY/READ_ALONG = spacer
//     (audio is declarative <Audio>; read-along highlight is frame-derived).
//   • media leaves are Remotion primitives (Img / OffthreadVideo / ThorVG lottie)
//     via createRenderStageRenderers — geometry/z-index identical to live.
//
// Phase 02: the visual stage + GSAP timeline + read-along highlight now live in
// the shared <BookSpreadCore> (also used by the full-book composition). This
// 1-spread wrapper just supplies the global frame as the seek/word clock and
// emits its own <Audio> (offset 0). The exported component + props are unchanged.

import { useMemo } from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { PlayableSpread } from "@/types/playable-types";
import type { RemixLanguageCode } from "@/types/editor";
import { resolveDesignCanvasWidth } from "@/utils/canvas-math-utils";
import { BookSpreadCore } from "./book-spread-core";
import { buildSpreadAudioSequences } from "./build-spread-audio-sequences";

// Type alias (not interface): Remotion's <Composition> requires props to satisfy
// `Record<string, unknown>`, which interfaces don't (no implicit index signature).
export type SpreadVideoCompositionProps = {
  spread: PlayableSpread;
  // App-wide supported set (en_US, vi_VN, ja_JP, ko_KR, zh_CN). Textbox content is keyed
  // by language string, so the render core is language-agnostic — no per-language code.
  language: RemixLanguageCode;
  // Book sizing the spread was authored against. Drives font/border scaling so render
  // text matches the live player: the design-canvas width is derived from dimension
  // (+ bleed) via the SAME table the player uses. Omitted (demo) → 800×600 fallback.
  dimension?: number | null;
  bleedMm?: number | null;
};

export function SpreadVideoComposition({
  spread,
  language,
  dimension,
  bleedMm,
}: SpreadVideoCompositionProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const designCanvasWidth = useMemo(
    () => resolveDesignCanvasWidth({ dimension, bleedMm }),
    [dimension, bleedMm]
  );

  // Single-spread: seek time === composition time (the comp's own duration already
  // carries the tail pad), so no settle clamp here. Read-along uses the same frame.
  const audioSequences = useMemo(
    () => buildSpreadAudioSequences(spread, language, fps, 0),
    [spread, language, fps]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#ffffff" }}>
      <BookSpreadCore
        spread={spread}
        language={language}
        canvasWidth={designCanvasWidth}
        seekSec={frame / fps}
        wordFrame={frame}
      />

      {audioSequences.map((a) => (
        <Sequence key={a.key} from={a.from}>
          <Audio src={a.url} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
