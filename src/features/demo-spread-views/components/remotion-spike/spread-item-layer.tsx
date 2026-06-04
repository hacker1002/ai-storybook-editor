// components/remotion-spike/spread-item-layer.tsx
// Minimal deterministic item renderer for the Remotion spike. Renders a spread's
// images / shapes / textboxes as absolutely-positioned DOM keyed by item id, and
// registers each node into a refs Map so the GSAP tween builders (which target real
// DOM via gsap.to(element)) can drive them. Intentionally NOT PlayerCanvas — that
// component is coupled to the wall-clock playback store. % geometry mirrors the
// player's layout model (left/top/width/height as % of the spread container).

import { Fragment, useCallback } from "react";
import { Img, OffthreadVideo } from "remotion";
import type { PlayableSpread } from "@/types/playable-types";
import type {
  SpreadImage,
  SpreadShape,
  SpreadTextbox,
  SpreadTextboxContent,
  SpreadVideo,
  SpreadAutoPic,
  Typography,
} from "@/types/spread-types";
// Frame-deterministic lottie player on the SAME engine the editor preview uses (ThorVG via
// @lottiefiles/dotlottie-web), driven by setFrame + a per-frame 'render' gate instead of
// rAF — used in BOTH <Player> preview and worker render so lottie pixels match
// (preview===output), while keeping dotLottie v2 theme / state-machine / embedded fonts.
import { DotLottiePlayer } from "@/remotion/lottie/thorvg-lottie-player";

interface SpreadItemLayerProps {
  spread: PlayableSpread;
  language: "en_US" | "vi_VN";
  /** Mutable map filled on mount — keyed by item id (= animation target id). */
  refsMap: Map<string, HTMLElement>;
  /** Frame-derived active read-along word index per textbox id (-1 = none). */
  activeWordByTextbox?: Record<string, number>;
}

const ACTIVE_WORD_STYLE: React.CSSProperties = {
  backgroundColor: "#ffe58a",
  borderRadius: 3,
  boxDecorationBreak: "clone",
  WebkitBoxDecorationBreak: "clone",
};

/**
 * Render read-along text as per-word spans, highlighting the active word. Splits on
 * whitespace while preserving it (newlines → <br/>) so word index aligns 1:1 with
 * word_timings order. This is the render-mode equivalent of the player's
 * `span[data-word-index]` + `read-along-active-word` class — driven by frame, not
 * audio.currentTime polling.
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

export function SpreadItemLayer({
  spread,
  language,
  refsMap,
  activeWordByTextbox = {},
}: SpreadItemLayerProps) {
  // Callback ref factory: register/unregister into the shared map. Stable per id
  // via closure; React calls with null on unmount.
  const register = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) refsMap.set(id, el);
      else refsMap.delete(id);
    },
    [refsMap]
  );

  const images = (spread.images ?? []) as SpreadImage[];
  const shapes = (spread.shapes ?? []) as SpreadShape[];
  const textboxes = (spread.textboxes ?? []) as SpreadTextbox[];
  const videos = (spread.videos ?? []) as SpreadVideo[];
  const autoPics = (spread.auto_pics ?? []) as SpreadAutoPic[];

  return (
    <>
      {shapes.map((shape) => {
        const opacity = shape.fill?.opacity ?? 1;
        return (
          <div
            key={shape.id}
            ref={register(shape.id)}
            data-item-id={shape.id}
            data-base-opacity={opacity}
            style={{
              ...geoStyle(shape.geometry),
              zIndex: shape["z-index"] ?? 150,
              backgroundColor: shape.fill?.is_filled ? shape.fill.color : "transparent",
              opacity,
              border: shape.outline
                ? `${shape.outline.width}px solid ${shape.outline.color}`
                : undefined,
              borderRadius: shape.outline?.radius ?? 0,
            }}
          />
        );
      })}

      {images.map((img) => (
        <div
          key={img.id}
          ref={register(img.id)}
          data-item-id={img.id}
          data-base-opacity={1}
          style={{ ...geoStyle(img.geometry), zIndex: img["z-index"] ?? 100 }}
        >
          <img
            src={img.media_url}
            alt={img.title ?? ""}
            crossOrigin="anonymous"
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </div>
      ))}

      {/* Video — Remotion <OffthreadVideo> is frame-synced (deterministic) and its
          audio is muxed on render. NOT muted: Player playback is user-gesture-initiated
          so sound is allowed; render-mode replacement for the player's <video>.play().
          (Lottie/webp auto_pics have no audio track by nature.) */}
      {videos.map((v) => (
        <div
          key={v.id}
          ref={register(v.id)}
          data-item-id={v.id}
          data-base-opacity={1}
          style={{ ...geoStyle(v.geometry), zIndex: v["z-index"] ?? 200 }}
        >
          {v.media_url ? (
            <OffthreadVideo
              src={v.media_url}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
          ) : null}
        </div>
      ))}

      {/* Auto-pic — .lottie via the ThorVG DotLottiePlayer (frame-driven: setFrame + per-
          frame 'render' gate → deterministic, theme/state-machine/font-faithful), else
          (.webp/.gif/.webm) via <Img>. NOTE: the <Img> branch is a single static frame —
          animated webp/gif aren't frame-deterministic yet (future: frame-extract). */}
      {autoPics.map((pic) => {
        const url = pic.media_url?.toLowerCase().split("?")[0] ?? "";
        const isLottie = url.endsWith(".lottie");
        return (
          <div
            key={pic.id}
            ref={register(pic.id)}
            data-item-id={pic.id}
            data-base-opacity={1}
            style={{ ...geoStyle(pic.geometry), zIndex: pic["z-index"] ?? 210 }}
          >
            {pic.media_url ? (
              isLottie ? (
                <DotLottiePlayer src={pic.media_url} options={pic.lottie} />
              ) : (
                <Img
                  src={pic.media_url}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              )
            ) : null}
          </div>
        );
      })}

      {textboxes.map((tb) => {
        const content = tb[language] as SpreadTextboxContent | undefined;
        if (!content) return null;
        const isReadAlong = (content.audio?.word_timings?.length ?? 0) > 0;
        const activeIndex = activeWordByTextbox[tb.id] ?? -1;
        return (
          <div
            key={tb.id}
            ref={register(tb.id)}
            data-item-id={tb.id}
            data-base-opacity={1}
            style={{
              ...geoStyle(content.geometry),
              zIndex: tb["z-index"] ?? 200,
              ...typographyStyle(content.typography),
              padding: 8,
              overflow: "hidden",
            }}
          >
            {isReadAlong ? renderWordSpans(content.text, activeIndex) : content.text}
          </div>
        );
      })}
    </>
  );
}
