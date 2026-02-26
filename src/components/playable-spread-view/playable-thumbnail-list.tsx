// playable-thumbnail-list.tsx - Footer thumbnail list for spread navigation
"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PlayableThumbnailListProps, PlayableSpread } from "./types";
import { LAYOUT, THUMBNAIL_STYLES } from "./constants";

// === Canvas Constants (from canvas-spread-view) ===
const CANVAS = {
  BASE_WIDTH: 800,
  BASE_HEIGHT: 600,
} as const;

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
  // Scale factor: thumbnail width / canvas base width
  const scale = LAYOUT.THUMBNAIL_WIDTH / CANVAS.BASE_WIDTH;

  // Page label
  const pageLabel = useMemo(() => {
    if (spread.pages.length === 1) {
      return `Page ${spread.pages[0].number}`;
    }
    return `Pages ${spread.pages[0].number}-${spread.pages[1].number}`;
  }, [spread.pages]);

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

          {/* Objects (simplified rendering) */}
          {spread.objects?.map((object, idx) => {
            const geometry = object.geometry;
            return (
              <div
                key={object.id || idx}
                className="absolute bg-gray-300"
                style={{
                  left: `${geometry.x}%`,
                  top: `${geometry.y}%`,
                  width: `${geometry.w}%`,
                  height: `${geometry.h}%`,
                  pointerEvents: "none",
                }}
              />
            );
          })}

          {/* Textboxes (simplified rendering) */}
          {spread.textboxes?.map((textbox, idx) => {
            // Extract data from language key (e.g., en_US, vi_VN)
            const langKey = Object.keys(textbox).find(
              (k) => k !== "id" && k !== "title" && typeof textbox[k as keyof typeof textbox] === "object"
            );
            if (!langKey) return null;

            const langData = textbox[langKey as keyof typeof textbox] as {
              text: string;
              geometry: { x: number; y: number; w: number; h: number };
              typography?: { size?: number; weight?: number; style?: string; family?: string; color?: string; textAlign?: string; lineHeight?: number };
            };
            if (!langData?.geometry) return null;

            const { geometry, typography } = langData;
            return (
              <div
                key={textbox.id || idx}
                className="absolute overflow-hidden"
                style={{
                  left: `${geometry.x}%`,
                  top: `${geometry.y}%`,
                  width: `${geometry.w}%`,
                  height: `${geometry.h}%`,
                  fontSize: typography?.size ? `${typography.size}px` : "14px",
                  fontWeight: typography?.weight || 400,
                  fontStyle: typography?.style || "normal",
                  fontFamily: typography?.family || "inherit",
                  color: typography?.color || "#000000",
                  textAlign: (typography?.textAlign || "left") as React.CSSProperties["textAlign"],
                  lineHeight: typography?.lineHeight || 1.5,
                  pointerEvents: "none",
                }}
              >
                {langData.text}
              </div>
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
            onClick={() => onSpreadClick(spread.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default PlayableThumbnailList;
