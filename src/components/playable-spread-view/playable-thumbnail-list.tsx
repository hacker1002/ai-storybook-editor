// playable-thumbnail-list.tsx - Footer thumbnail list for spread navigation
"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { EditableTextbox, EditableObject } from "../shared";
import type { PlayableThumbnailListProps, PlayableSpread } from "./types";
import type { Geometry, Typography, Fill, Outline } from "../shared/types";
import { LAYOUT, THUMBNAIL_STYLES } from "./constants";

// === Canvas Constants (from canvas-spread-view) ===
const CANVAS = {
  BASE_WIDTH: 800,
  BASE_HEIGHT: 600,
} as const;

const TEXTBOX_Z_INDEX_BASE = 300;

// Helper to find language key in textbox (same pattern as animation-editor-canvas)
function getTextboxLanguageKey(textbox: Record<string, unknown>, preferredLang: string): string | null {
  if (textbox[preferredLang] && typeof textbox[preferredLang] === 'object') {
    return preferredLang;
  }
  const langKey = Object.keys(textbox).find(
    (k) => k !== 'id' && k !== 'title' && typeof textbox[k] === 'object'
  );
  return langKey || null;
}

// === PlayableThumbnail Item Component ===
interface PlayableThumbnailProps {
  spread: PlayableSpread;
  index: number;
  isSelected: boolean;
  language: string;
  onClick: () => void;
}

const PlayableThumbnail = React.memo(function PlayableThumbnail({
  spread,
  index,
  isSelected,
  language,
  onClick,
}: PlayableThumbnailProps) {
  // Scale factor: thumbnail width / canvas base width
  const scale = LAYOUT.THUMBNAIL_WIDTH / CANVAS.BASE_WIDTH;

  // Page label
  const pageLabel = useMemo(() => {
    if (spread.pages.length === 1) {
      return `Page ${spread.pages[0].number}`;
    }
    return `Pages ${spread.pages[0].number}-${spread.pages[1].number}`;
  }, [spread.pages]);

  // Memoized textboxes with resolved language (same pattern as animation-editor-canvas)
  const textboxesWithLang = useMemo(() => {
    if (!spread.textboxes) return [];
    return spread.textboxes.map((textbox) => {
      const langKey = getTextboxLanguageKey(textbox, language);
      if (!langKey) return null;
      const data = textbox[langKey] as {
        text: string;
        geometry: Geometry;
        typography: Typography;
        fill?: Fill;
        outline?: Outline;
      };
      if (!data?.geometry) return null;
      return { textbox, langKey, data };
    }).filter(Boolean);
  }, [spread.textboxes, language]);

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
        height: LAYOUT.THUMBNAIL_HEIGHT,
        borderRadius: THUMBNAIL_STYLES.BORDER_RADIUS,
        cursor: "pointer",
      }}
    >
      {/* Preview Area */}
      <div className="relative flex-1 bg-white overflow-hidden">
        {/* Scaled Content Container */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: CANVAS.BASE_WIDTH,
            height: CANVAS.BASE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            pointerEvents: "none",
          }}
        >
          {/* Page Backgrounds */}
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
                }}
              />
            );
          })}

          {/* Page Divider (if 2 pages) */}
          {spread.pages.length > 1 && (
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-300" />
          )}

          {/* Objects (using EditableObject component) */}
          {spread.objects?.map((object, idx) => (
            <EditableObject
              key={object.id || idx}
              object={object}
              index={idx}
              isSelected={false}
              isEditable={false}
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
                text={data.text}
                geometry={data.geometry}
                typography={data.typography}
                fill={data.fill}
                outline={data.outline}
                index={idx}
                zIndex={TEXTBOX_Z_INDEX_BASE + idx}
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
  language,
  onSpreadClick,
}: PlayableThumbnailListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll selected thumbnail into view
  useEffect(() => {
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
  }, [selectedId]);

  // Note: Keyboard navigation (ArrowLeft/Right) is handled by parent PlayableSpreadView
  // to avoid double handling and ensure consistent behavior

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
            language={language}
            onClick={() => onSpreadClick(spread.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default PlayableThumbnailList;
