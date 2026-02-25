// spread-thumbnail.tsx
"use client";

import React, {
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import {
  buildViewOnlyImageContext,
  buildViewOnlyTextContext,
} from "./utils/context-builders";
import { CANVAS, THUMBNAIL } from "./constants";
import type {
  BaseSpread,
  ItemType,
  ImageItemContext,
  TextItemContext,
} from "./types";

interface SpreadThumbnailProps<TSpread extends BaseSpread> {
  // Data
  spread: TSpread;
  spreadIndex: number;

  // State
  isSelected: boolean;
  size: "small" | "medium";

  // Render configuration (optional - skip rendering if not provided)
  renderItems: ItemType[];
  renderImageItem?: (context: ImageItemContext<TSpread>) => ReactNode;
  renderTextItem?: (context: TextItemContext<TSpread>) => ReactNode;

  // Drag state
  isDragEnabled?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;

  // Callbacks
  onClick: () => void;
  onDoubleClick?: () => void; // Grid mode: switch to Edit
  onDelete?: () => void; // Delete spread
  canDelete?: boolean; // Enable delete feature
  isLastSpread?: boolean; // Hide delete if true (can't delete last spread)
  onDragStart?: () => void;
  onDragOver?: () => void;
  onDragEnd?: () => void;
}

function SpreadThumbnailInner<TSpread extends BaseSpread>({
  spread,
  spreadIndex,
  isSelected,
  size,
  renderItems,
  renderImageItem,
  renderTextItem,
  isDragEnabled = false,
  isDragging = false,
  isDropTarget = false,
  onClick,
  onDoubleClick,
  onDelete,
  canDelete = false,
  isLastSpread = false,
  onDragStart,
  onDragOver,
  onDragEnd,
}: SpreadThumbnailProps<TSpread>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width for medium mode scaling
  useLayoutEffect(() => {
    if (size !== "medium" || !containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [size]);

  // Scale factor: small uses fixed, medium calculates from container width
  const scale =
    size === "small"
      ? THUMBNAIL.SMALL_SCALE
      : containerWidth > 0
      ? containerWidth / CANVAS.BASE_WIDTH
      : 0;

  // Page label
  const label = useMemo(() => {
    if (spread.pages.length === 1) {
      return `Page ${spread.pages[0].number}`;
    }
    return `Pages ${spread.pages[0].number}-${spread.pages[1].number}`;
  }, [spread.pages]);

  // Memoize image contexts - skip if renderImageItem not provided
  const imageContexts = useMemo(() => {
    if (!renderItems.includes("image") || !renderImageItem) return [];
    return spread.images.map((img, idx) => ({
      image: img,
      context: buildViewOnlyImageContext(img, idx, spread),
    }));
  }, [spread.images, spread.id, renderItems, renderImageItem]);

  // Memoize text contexts - skip if renderTextItem not provided
  const textContexts = useMemo(() => {
    if (!renderItems.includes("text") || !renderTextItem) return [];
    return spread.textboxes.map((textbox, idx) => ({
      textbox,
      context: buildViewOnlyTextContext(textbox, idx, spread),
    }));
  }, [spread.textboxes, spread.id, renderItems, renderTextItem]);

  // Cursor style: grabbing while dragging, grab when can drag, pointer otherwise
  const cursor = isDragging ? "grabbing" : isDragEnabled ? "grab" : "pointer";

  // Show delete button when hovering and not last spread
  const showDeleteButton = canDelete && !isLastSpread;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      aria-label={`Spread ${spreadIndex + 1}, ${label}`}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn(
        "flex-shrink-0 transition-all scroll-snap-align-start",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        isDragging && "opacity-50",
        isDropTarget && "ring-2 ring-dashed ring-blue-400"
      )}
      draggable={isDragEnabled}
      aria-grabbed={isDragging}
      onDragStart={(e) => {
        if (!isDragEnabled) return;
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragOver={(e) => {
        if (!isDragEnabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver?.();
      }}
      onDragEnd={onDragEnd}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      }}
    >
      {/* Thumbnail Container - responsive width with fixed aspect ratio */}
      <div
        ref={containerRef}
        className={cn(
          "thumbnail-container relative overflow-hidden rounded-md bg-white shadow-sm",
          "hover:shadow-md transition-shadow",
          size === "medium" && "w-full", // Medium: fill grid cell, Small: fixed
          isSelected && "ring-2 ring-blue-500"
        )}
        style={{
          // Maintain aspect ratio (4:3) regardless of container width
          aspectRatio: `${CANVAS.ASPECT_RATIO}`,
          // Small size: fixed dimensions, Medium: responsive
          ...(size === "small" && {
            width: THUMBNAIL.SMALL_SIZE.width,
            height: THUMBNAIL.SMALL_SIZE.height,
          }),
          contain: "layout style paint",
        }}
      >
        {/* Scaled Content: render at 800×600, scale down to fit container */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: CANVAS.BASE_WIDTH,
            height: CANVAS.BASE_HEIGHT,
            transform: scale > 0 ? `scale(${scale})` : "scale(0)",
            transformOrigin: "top left",
            pointerEvents: "none",
            // Hide until scale is calculated (prevents flash)
            visibility: scale > 0 ? "visible" : "hidden",
          }}
        >
          {/* Page Background */}
          <div className="absolute inset-0 bg-gray-50" />

          {/* Page Divider */}
          {spread.pages.length > 1 && (
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-200" />
          )}

          {/* Images (view-only, pointer-events: none) - skip if renderImageItem not provided */}
          {renderImageItem && imageContexts.map(({ image, context }, index) => (
            <div key={image.id || index} style={{ pointerEvents: "none" }}>
              {renderImageItem(context)}
            </div>
          ))}

          {/* Textboxes (view-only, pointer-events: none) - skip if renderTextItem not provided */}
          {renderTextItem && textContexts.map(({ textbox, context }, index) => (
            <div key={textbox.id || index} style={{ pointerEvents: "none" }}>
              {renderTextItem(context)}
            </div>
          ))}
        </div>

        {/* Click Overlay - captures all clicks/double-clicks */}
        <div
          className="absolute inset-0"
          style={{
            zIndex: 10,
            cursor,
            pointerEvents: "auto",
          }}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        />

        {/* Delete Button - shows on hover */}
        {showDeleteButton && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className={cn(
              "delete-button absolute top-1 right-1 z-20",
              "w-6 h-6 rounded-full bg-red-500 text-white",
              "flex items-center justify-center",
              "opacity-0 transition-opacity duration-150",
              "hover:bg-red-600"
            )}
            aria-label="Delete spread"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6m4-6v6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Label */}
      <p className="mt-1 text-xs text-center text-muted-foreground truncate">
        {label}
      </p>

      {/* CSS for delete button hover visibility */}
      <style>{`
        .thumbnail-container:hover .delete-button {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}

// Export memoized component
export const SpreadThumbnail = React.memo(
  SpreadThumbnailInner
) as typeof SpreadThumbnailInner;

export default SpreadThumbnail;
