// spread-thumbnail.tsx
"use client";

import React, {
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { cn } from "@/utils/utils";
import {
  buildViewOnlyImageContext,
  buildViewOnlyTextContext,
  buildViewOnlyShapeContext,
  buildViewOnlyVideoContext,
  buildViewOnlyAudioContext,
  buildViewOnlyQuizContext,
} from "./utils/context-builders";
import { CANVAS, THUMBNAIL } from "@/constants/spread-constants";
import type {
  BaseSpread,
  ItemType,
  ImageItemContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AudioItemContext,
  QuizItemContext,
} from "@/types/canvas-types";

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
  renderShapeItem?: (context: ShapeItemContext<TSpread>) => ReactNode;
  renderVideoItem?: (context: VideoItemContext<TSpread>) => ReactNode;
  renderAudioItem?: (context: AudioItemContext<TSpread>) => ReactNode;
  renderQuizItem?: (context: QuizItemContext<TSpread>) => ReactNode;

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
  renderShapeItem,
  renderVideoItem,
  renderAudioItem,
  renderQuizItem,
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

  // Scale factor: calculated from container width (unified for both sizes)
  const effectiveWidth =
    size === "small" ? THUMBNAIL.SMALL_WIDTH : containerWidth;
  const scale = effectiveWidth > 0 ? effectiveWidth / CANVAS.BASE_WIDTH : 0;

  // Page label
  const label = useMemo(() => {
    if (spread.pages.length === 1) {
      return `Page ${spread.pages[0].number}`;
    }
    return `Pages ${spread.pages[0].number}-${spread.pages[1].number}`;
  }, [spread.pages]);

  // Memoize image contexts - combines raw_images (illustration layer) and images (playable layer).
  // Combined index: raw images occupy [0..rawCount-1], playable images [rawCount..].
  const imageContexts = useMemo(() => {
    if ((!renderItems.includes("image") && !renderItems.includes("raw_image")) || !renderImageItem) return [];
    const images = renderItems.includes("raw_image")
      ? (spread.raw_images ?? [])
      : [...(spread.raw_images ?? []), ...spread.images];
    return images.map((img, combinedIdx) => ({
      image: img,
      context: buildViewOnlyImageContext(img, combinedIdx, spread),
    }));
  }, [spread.raw_images, spread.images, spread.id, renderItems, renderImageItem]);

  // Memoize text contexts - combines raw_textboxes (illustration layer) and textboxes (playable layer).
  // Combined index: raw textboxes occupy [0..rawCount-1], playable textboxes [rawCount..].
  const textContexts = useMemo(() => {
    if ((!renderItems.includes("textbox") && !renderItems.includes("raw_textbox")) || !renderTextItem) return [];
    const textboxes = renderItems.includes("raw_textbox")
      ? (spread.raw_textboxes ?? [])
      : [...(spread.raw_textboxes ?? []), ...spread.textboxes];
    return textboxes.map((textbox, combinedIdx) => ({
      textbox,
      context: buildViewOnlyTextContext(textbox, combinedIdx, spread),
    }));
  }, [spread.raw_textboxes, spread.textboxes, spread.id, renderItems, renderTextItem]);

  // Memoize shape contexts - shapes are playable-only (no raw shapes)
  const shapeContexts = useMemo(() => {
    if (!renderItems.includes("shape") || !renderShapeItem || !spread.shapes)
      return [];
    return spread.shapes.map((shape, idx) => ({
      shape,
      context: buildViewOnlyShapeContext(shape, idx, spread),
    }));
  }, [spread.shapes, spread.id, renderItems, renderShapeItem]);

  // Memoize video contexts - skip if renderVideoItem not provided
  const videoContexts = useMemo(() => {
    if (!renderItems.includes("video") || !renderVideoItem || !spread.videos)
      return [];
    return spread.videos.map((video, idx) => ({
      video,
      context: buildViewOnlyVideoContext(video, idx, spread),
    }));
  }, [spread.videos, spread.id, renderItems, renderVideoItem]);

  // Memoize audio contexts - skip if renderAudioItem not provided
  const audioContexts = useMemo(() => {
    if (!renderItems.includes("audio") || !renderAudioItem || !spread.audios)
      return [];
    return spread.audios.map((audio, idx) => ({
      audio,
      context: buildViewOnlyAudioContext(audio, idx, spread),
    }));
  }, [spread.audios, spread.id, renderItems, renderAudioItem]);

  // Memoize quiz contexts - skip if renderQuizItem not provided
  const quizContexts = useMemo(() => {
    if (!renderItems.includes("quiz") || !renderQuizItem || !spread.quizzes)
      return [];
    return spread.quizzes.map((quiz, idx) => ({
      quiz,
      context: buildViewOnlyQuizContext(quiz, idx, spread),
    }));
  }, [spread.quizzes, spread.id, renderItems, renderQuizItem]);

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
          // Small size: fixed width, Medium: responsive (aspectRatio handles height)
          ...(size === "small" && { width: THUMBNAIL.SMALL_WIDTH }),
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

          {/* Page Divider */}
          {spread.pages.length > 1 && (
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-300" />
          )}

          {/* Images (view-only, pointer-events: none) - skip if renderImageItem not provided */}
          {renderImageItem &&
            imageContexts.map(({ image, context }, index) => (
              <div key={image.id || index} style={{ pointerEvents: "none" }}>
                {renderImageItem(context)}
              </div>
            ))}

          {/* Videos (view-only, pointer-events: none) - skip if renderVideoItem not provided */}
          {renderVideoItem &&
            videoContexts.map(({ video, context }, index) => (
              <div key={video.id || index} style={{ pointerEvents: "none" }}>
                {renderVideoItem(context)}
              </div>
            ))}

          {/* Shapes (view-only, pointer-events: none) - skip if renderShapeItem not provided */}
          {renderShapeItem &&
            shapeContexts.map(({ shape, context }, index) => (
              <div key={shape.id || index} style={{ pointerEvents: "none" }}>
                {renderShapeItem(context)}
              </div>
            ))}

          {/* Textboxes (view-only, pointer-events: none) - skip if renderTextItem not provided */}
          {renderTextItem &&
            textContexts.map(({ textbox, context }, index) => (
              <div key={textbox.id || index} style={{ pointerEvents: "none" }}>
                {renderTextItem(context)}
              </div>
            ))}

          {/* Audios (view-only, pointer-events: none) - skip if renderAudioItem not provided */}
          {renderAudioItem &&
            audioContexts.map(({ audio, context }, index) => (
              <div key={audio.id || index} style={{ pointerEvents: "none" }}>
                {renderAudioItem(context)}
              </div>
            ))}

          {/* Quizzes (view-only, pointer-events: none) - skip if renderQuizItem not provided */}
          {renderQuizItem &&
            quizContexts.map(({ quiz, context }, index) => (
              <div key={quiz.id || index} style={{ pointerEvents: "none" }}>
                {renderQuizItem(context)}
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
