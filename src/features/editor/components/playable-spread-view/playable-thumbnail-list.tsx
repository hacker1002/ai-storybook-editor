// playable-thumbnail-list.tsx - Footer thumbnail list for spread navigation
"use client";

import React, { useRef, useEffect, useMemo, useState } from "react";
import { cn } from "@/utils/utils";
import {
  EditableTextbox,
  EditableImage,
  EditableShape,
  EditableVideo,
  EditableAudio,
  EditableAutoPic,
  EditableAutoAudio,
} from "../shared-components";
import { getTextboxContentForLanguage } from "../../utils/textbox-helpers";
import { useNarrationLanguage } from "@/stores/animation-playback-store";
import { useCanvasWidth, useCanvasAspectRatio } from "@/stores/editor-settings-store";
import { LAYER_CONFIG, Z_INDEX } from "@/constants/spread-constants";
import { createLogger } from "@/utils/logger";
import type { PlayableSpread } from "@/types/playable-types";

const log = createLogger("Editor", "PlayableThumbnailList");

// Window radius for offscreen render-window strategy.
// ±2 matches `usePlayerSpreadPreload` lookahead so eager spread-turn clone
// covers rapid 2-step Forward navigation without remounting thumbnails.
const OFFSCREEN_WINDOW_RADIUS = 2;

export type ThumbnailRenderMode = "visible" | "offscreen";

// === Layout Constants ===
const LAYOUT = {
  FOOTER_HEIGHT: 120,
  THUMBNAIL_WIDTH: 100,
  LABEL_HEIGHT: 20,
  THUMBNAIL_GAP: 8,
} as const;

// === Thumbnail Styles ===
const THUMBNAIL_STYLES = {
  SELECTED_BORDER: "2px solid #2196F3",
  UNSELECTED_BORDER: "1px solid #E0E0E0",
  HOVER_BG: "#E3F2FD",
  BORDER_RADIUS: 4,
} as const;

// === Props Interface ===
export interface PlayableThumbnailListProps {
  spreads: PlayableSpread[];
  selectedId: string | null;
  onSpreadClick: (spreadId: string) => void;
  /**
   * 'visible'   — full footer strip (default editor behavior).
   * 'offscreen' — collapse footprint via clip-path; render only ±2 window
   *               around `selectedId` plus monotonic cache. Keeps decoded
   *               <img> bitmaps in DOM so `useSpreadTurnTransition` can
   *               eagerly clone via `[data-thumbnail-content]` selector.
   *
   * IMPORTANT: do NOT swap clip-path for `display:none`/`visibility:hidden`/
   * `content-visibility:hidden` — all three suspend image decode and break
   * the eager clone path (back face flickers blank during page turn).
   */
  renderMode?: ThumbnailRenderMode;
}

// === PlayableThumbnail Item Component ===
interface PlayableThumbnailProps {
  spread: PlayableSpread;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}

const PlayableThumbnail = React.memo(function PlayableThumbnail({
  spread,
  index,
  isSelected,
  onClick,
}: PlayableThumbnailProps) {
  const narrationLangCode = useNarrationLanguage();
  const canvasWidth = useCanvasWidth();
  const canvasAspectRatio = useCanvasAspectRatio();
  const canvasHeight = canvasWidth / canvasAspectRatio;
  // Scale factor: thumbnail width / canvas width
  const scale = LAYOUT.THUMBNAIL_WIDTH / canvasWidth;

  // Page label
  const pageLabel = useMemo(() => {
    if (spread.pages.length === 1) {
      return `Page ${spread.pages[0].number}`;
    }
    return `Pages ${spread.pages[0].number}-${spread.pages[1].number}`;
  }, [spread.pages]);

  const textboxesWithLang = useMemo(() => {
    if (!spread.textboxes) return [];
    return spread.textboxes
      .map((textbox) => {
        if (textbox.player_visible === false) return null;
        const result = getTextboxContentForLanguage(textbox, narrationLangCode);
        if (!result?.content?.geometry) return null;
        return { textbox, langKey: result.langKey, data: result.content };
      })
      .filter(Boolean);
  }, [spread.textboxes, narrationLangCode]);

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      aria-label={`Spread ${index + 1}, ${pageLabel}`}
      tabIndex={isSelected ? 0 : -1}
      data-spread-id={spread.id}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex-shrink-0 flex flex-col overflow-hidden rounded",
        "transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isSelected
          ? "border-2 border-primary"
          : "border border-border hover:bg-accent"
      )}
      style={{
        width: LAYOUT.THUMBNAIL_WIDTH,
        borderRadius: THUMBNAIL_STYLES.BORDER_RADIUS,
        cursor: "pointer",
      }}
    >
      {/* Preview Area — aspectRatio matches canvas so thumbnail has no extra padding below */}
      <div
        className="relative bg-white overflow-hidden w-full"
        style={{ aspectRatio: `${canvasAspectRatio}` }}
      >
        {/* Scaled Content Container.
            `data-thumbnail-content` lets `useSpreadTurnTransition` locate this
            node and clone it into the page-turn BackFace — saves a full
            re-render + re-decode of the new spread's media, since these
            <img> elements are already in DOM with decoded bitmaps cached. */}
        <div
          data-thumbnail-content={spread.id}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: canvasWidth,
            height: canvasHeight,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          {/* Page Backgrounds — z-index matches canvas convention so items
              with item["z-index"] stack above pages consistently. */}
          {spread.pages.map((page, pageIndex) => {
            const isDPS = spread.pages.length === 1;
            const positionStyle: React.CSSProperties = isDPS
              ? { left: 0, top: 0, width: "100%", height: "100%" }
              : pageIndex === 0
              ? { left: 0, top: 0, width: "50%", height: "100%" }
              : { left: "50%", top: 0, width: "50%", height: "100%" };

            return (
              <div
                key={pageIndex}
                className="absolute"
                style={{
                  ...positionStyle,
                  backgroundColor: page.background.color,
                  backgroundImage: page.background.texture
                    ? `url(/textures/${page.background.texture}.png)`
                    : "none",
                  backgroundRepeat: "repeat",
                  backgroundSize: "256px 256px",
                  zIndex: Z_INDEX.PAGE_BACKGROUND,
                }}
              />
            );
          })}

          {/* Page Divider — always visible, khớp với player-canvas */}
          <div
            className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-300"
            style={{ zIndex: Z_INDEX.PAGE_BACKGROUND }}
          />

          {/* Items below forward item["z-index"] to Editable components so
              thumbnail stacking matches player-canvas.tsx behaviour. */}

          {/* Images (using EditableImage component) */}
          {spread.images?.map((image, idx) => {
            if (image.player_visible === false) return null;
            return (
              <EditableImage
                key={image.id || idx}
                image={image}
                index={idx}
                zIndex={image["z-index"]}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            );
          })}

          {/* Videos (thumbnail - static) */}
          {spread.videos?.map((video, idx) => {
            if (video.player_visible === false) return null;
            return (
              <EditableVideo
                key={video.id || idx}
                video={video}
                index={idx}
                zIndex={video["z-index"]}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            );
          })}

          {/* Auto Pics (thumbnail - auto-loop) */}
          {spread.auto_pics?.map((autoPic, idx) => {
            if (autoPic.player_visible === false) return null;
            return (
              <EditableAutoPic
                key={autoPic.id || idx}
                autoPic={autoPic}
                index={idx}
                zIndex={autoPic["z-index"]}
                isSelected={false}
                isEditable={false}
                isThumbnail={true}
                onSelect={() => {}}
              />
            );
          })}

          {/* Shapes (thumbnail) */}
          {spread.shapes?.map((shape, idx) => {
            if (shape.player_visible === false) return null;
            return (
              <EditableShape
                key={shape.id || idx}
                shape={shape}
                index={idx}
                zIndex={shape["z-index"]}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            );
          })}

          {/* Audios (thumbnail - icon only) */}
          {spread.audios?.map((audio, idx) => {
            if (audio.player_visible === false) return null;
            return (
              <EditableAudio
                key={audio.id || idx}
                audio={audio}
                index={idx}
                zIndex={audio["z-index"]}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            );
          })}

          {/* Auto Audios (thumbnail - Music icon, no playback) */}
          {(spread.auto_audios ?? [])
            .filter((a) => a.editor_visible !== false)
            .map((autoAudio, idx) => (
              <EditableAutoAudio
                key={autoAudio.id || idx}
                autoAudio={autoAudio}
                index={idx}
                zIndex={autoAudio["z-index"]}
                isSelected={false}
                isEditable={true}
                isThumbnail={true}
                onSelect={() => {}}
              />
            ))}

          {/* Textboxes (using EditableTextbox component) */}
          {textboxesWithLang.map((item, idx) => {
            if (!item) return null;
            const { textbox, data } = item;
            return (
              <EditableTextbox
                key={textbox.id || idx}
                textboxContent={data}
                index={idx}
                zIndex={textbox["z-index"] ?? LAYER_CONFIG.TEXT.min + idx}
                isSelected={false}
                isSelectable={false}
                isEditable={false}
                onSelect={() => {}}
                onTextChange={() => {}}
                onEditingChange={() => {}}
              />
            );
          })}
        </div>
      </div>

      {/* Page Number Label */}
      <div
        className="h-5 px-1 text-xs text-center truncate bg-muted/50 flex items-center justify-center"
        style={{ fontSize: "10px" }}
      >
        {pageLabel}
      </div>
    </button>
  );
});

// === PlayableThumbnailList Component ===
export function PlayableThumbnailList({
  spreads,
  selectedId,
  onSpreadClick,
  renderMode = "visible",
}: PlayableThumbnailListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isOffscreen = renderMode === "offscreen";

  // === Window+cache (offscreen only) ===
  // `renderedIds` is monotonic — every id that ever entered the ±2 window stays
  // mounted until unmount. Worst case = render-all (baseline editor footprint);
  // win is when user exits early. Cache must NOT evict — re-mounting drops the
  // decoded bitmap and reintroduces the FOUC bug this mode was added to fix.
  const [renderedIds, setRenderedIds] = useState<Set<string>>(
    () => new Set(selectedId ? [selectedId] : [])
  );

  useEffect(() => {
    if (!isOffscreen) return;
    const idx = spreads.findIndex((s) => s.id === selectedId);
    if (idx < 0) return;

    const windowIds: string[] = [];
    for (let offset = -OFFSCREEN_WINDOW_RADIUS; offset <= OFFSCREEN_WINDOW_RADIUS; offset++) {
      const id = spreads[idx + offset]?.id;
      if (id) windowIds.push(id);
    }

    setRenderedIds((prev) => {
      const next = new Set(prev);
      const added: string[] = [];
      for (const id of windowIds) {
        if (!next.has(id)) {
          next.add(id);
          added.push(id);
        }
      }
      if (added.length === 0) return prev; // ref-stable → avoid spurious re-render
      log.debug("cacheExtend", "added thumbnails to render cache", {
        added,
        totalCachedCount: next.size,
        selectedId,
      });
      return next;
    });
  }, [selectedId, spreads, isOffscreen]);

  // Auto-scroll selected thumbnail into view (visible only — offscreen has no scroll)
  useEffect(() => {
    if (isOffscreen) return;
    if (!selectedId || !scrollContainerRef.current) return;

    const selectedElement = scrollContainerRef.current.querySelector(
      `[data-spread-id="${selectedId}"]`
    );

    if (selectedElement) {
      selectedElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [selectedId, isOffscreen]);

  // Note: Keyboard navigation (ArrowLeft/Right) is handled by parent PlayableSpreadView
  // to avoid double handling and ensure consistent behavior

  if (isOffscreen) {
    // Offscreen: collapse footprint to 1px via clip-path so eager clone path
    // (`[data-thumbnail-content]` selector in useSpreadTurnTransition) finds
    // the decoded bitmap without affecting layout or a11y tree.
    return (
      <div
        aria-hidden
        inert
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clipPath: "inset(50%)",
          pointerEvents: "none",
        }}
      >
        <div ref={scrollContainerRef}>
          {spreads.map((spread, index) => {
            if (!renderedIds.has(spread.id)) return null;
            return (
              <PlayableThumbnail
                key={spread.id}
                spread={spread}
                index={index}
                isSelected={spread.id === selectedId}
                onClick={() => onSpreadClick(spread.id)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Spread thumbnails"
      aria-orientation="horizontal"
      className="h-[120px] flex items-center px-4 border-t bg-background"
      style={{
        height: LAYOUT.FOOTER_HEIGHT,
      }}
    >
      {/* Scroll Container */}
      <div
        ref={scrollContainerRef}
        className="flex overflow-x-auto"
        style={{
          gap: LAYOUT.THUMBNAIL_GAP,
          scrollbarWidth: "thin",
        }}
      >
        {spreads.map((spread, index) => (
          <PlayableThumbnail
            key={spread.id}
            spread={spread}
            index={index}
            isSelected={spread.id === selectedId}
            onClick={() => onSpreadClick(spread.id)}
          />
        ))}
      </div>
    </div>
  );
}
