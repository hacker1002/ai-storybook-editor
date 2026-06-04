// remotion/render-stage-renderers.tsx
// Render-mode StageItemRenderers for PlayerSpreadStage (ADR-035). The deterministic
// counterpart of the live <Editable*> renderers: each leaf is a positioned
// (`position:absolute`, % geometry) div — the wrapper's firstElementChild that
// registerRef grabs and GSAP drives — containing a Remotion primitive
// (<Img>/<OffthreadVideo>/ThorVG) instead of an editor component. Same geometry +
// z-index as live ⇒ preview === output. Audio/quiz/auto-audio render nothing here:
// audio is declarative <Audio> in the composition, quiz collapses to a timing
// spacer (mode:'render'), and pages are drawn by the composition background.

import { Fragment } from "react";
import { Img, OffthreadVideo } from "remotion";
import type { Typography } from "@/types/spread-types";
// Frame-deterministic lottie player (ThorVG via @lottiefiles/dotlottie-web), driven
// by setFrame + per-frame 'render' gate — used in BOTH <Player> preview and worker
// render so lottie pixels match (preview===output). WASM resolved via bundled ?url.
import { DotLottiePlayer } from "@/remotion/lottie/thorvg-lottie-player";
import type { StageItemRenderers } from "@/features/editor/components/playable-spread-view/play-clock";

const ACTIVE_WORD_STYLE: React.CSSProperties = {
  backgroundColor: "#ffe58a",
  borderRadius: 3,
  boxDecorationBreak: "clone",
  WebkitBoxDecorationBreak: "clone",
};

function geoStyle(geo: { x: number; y: number; w: number; h: number }): React.CSSProperties {
  return {
    position: "absolute",
    left: `${geo.x}%`,
    top: `${geo.y}%`,
    width: `${geo.w}%`,
    height: `${geo.h}%`,
  };
}

function typographyStyle(t: Typography): React.CSSProperties {
  return {
    fontSize: t.size,
    fontWeight: t.weight,
    fontStyle: t.style,
    fontFamily: t.family,
    color: t.color,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
    textAlign: t.textAlign as React.CSSProperties["textAlign"],
    textTransform: t.textTransform as React.CSSProperties["textTransform"],
    textDecoration: t.decoration,
  };
}

/**
 * Read-along text as per-word spans (newlines → <br/>) with the active word
 * highlighted — render-mode equivalent of the player's span[data-word-index] +
 * .read-along-active-word class, driven by frame instead of audio.currentTime.
 */
function renderWordSpans(text: string, activeIndex: number): React.ReactNode {
  const segments = text.split(/(\s+)/);
  let wordIndex = -1;
  return segments.map((seg, i) => {
    if (/^\s+$/.test(seg) || seg === "") {
      if (seg.includes("\n")) return <br key={`br-${i}`} />;
      return <Fragment key={`ws-${i}`}>{seg}</Fragment>;
    }
    wordIndex += 1;
    const isActive = wordIndex === activeIndex;
    return (
      <span
        key={`w-${i}`}
        data-word-index={wordIndex}
        style={isActive ? ACTIVE_WORD_STYLE : undefined}
      >
        {seg}
      </span>
    );
  });
}

/** Resolve the best display URL for an image — mirrors PlayerSpreadStage's hasUrl
 *  priority so render shows the same pixels the live player resolves. */
function resolveImageUrl(image: {
  final_hires_media_url?: string | null;
  illustrations?: { media_url?: string | null }[];
  media_url?: string | null;
}): string {
  return (
    image.final_hires_media_url ||
    image.illustrations?.find((i) => i.media_url)?.media_url ||
    image.media_url ||
    ""
  );
}

/**
 * Build the render-mode renderer set. `activeWordByTextbox` (id → active word
 * index, recomputed per frame by the composition) drives read-along highlight;
 * the textbox renderer receives the textbox id from the stage to key into it.
 */
export function createRenderStageRenderers(
  activeWordByTextbox: Record<string, number>
): StageItemRenderers {
  return {
    // Pages drawn by the composition background (white) — same as the validated spike.
    page: () => null,

    image: (image, _index, zIndex) => (
      <div data-base-opacity={1} style={{ ...geoStyle(image.geometry), zIndex: zIndex ?? 100 }}>
        <img
          src={resolveImageUrl(image)}
          alt={image.title ?? ""}
          crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
    ),

    shape: (shape, _index, zIndex) => {
      const opacity = shape.fill?.opacity ?? 1;
      return (
        <div
          data-base-opacity={opacity}
          style={{
            ...geoStyle(shape.geometry),
            zIndex: zIndex ?? 150,
            backgroundColor: shape.fill?.is_filled ? shape.fill.color : "transparent",
            opacity,
            border: shape.outline
              ? `${shape.outline.width}px solid ${shape.outline.color}`
              : undefined,
            borderRadius: shape.outline?.radius ?? 0,
          }}
        />
      );
    },

    video: (video, _index, zIndex) => (
      <div data-base-opacity={1} style={{ ...geoStyle(video.geometry), zIndex: zIndex ?? 200 }}>
        {video.media_url ? (
          <OffthreadVideo
            src={video.media_url}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : null}
      </div>
    ),

    autoPic: (autoPic, _index, zIndex) => {
      const url = autoPic.media_url?.toLowerCase().split("?")[0] ?? "";
      const isLottie = url.endsWith(".lottie");
      return (
        <div data-base-opacity={1} style={{ ...geoStyle(autoPic.geometry), zIndex: zIndex ?? 210 }}>
          {autoPic.media_url ? (
            isLottie ? (
              <DotLottiePlayer src={autoPic.media_url} options={autoPic.lottie} />
            ) : (
              <Img
                src={autoPic.media_url}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            )
          ) : null}
        </div>
      );
    },

    // Audio is declarative <Audio> in the composition; no DOM here.
    audio: () => null,
    // Quiz collapses to a timing spacer (mode:'render'); no modal in render.
    quiz: () => null,
    // BGM auto-audio has no render-mode equivalent (muxed audio is per-step).
    autoAudio: () => null,

    textbox: (content, _index, zIndex, _wordTimings, textboxId) => {
      const isReadAlong = (content.audio?.word_timings?.length ?? 0) > 0;
      const activeIndex = activeWordByTextbox[textboxId] ?? -1;
      return (
        <div
          data-base-opacity={1}
          style={{
            ...geoStyle(content.geometry),
            zIndex: zIndex ?? 200,
            ...typographyStyle(content.typography),
            padding: 8,
            overflow: "hidden",
          }}
        >
          {isReadAlong ? renderWordSpans(content.text, activeIndex) : content.text}
        </div>
      );
    },
  };
}
