// spread-thumbnail.tsx
"use client";

import React, {
  Fragment,
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
import { THUMBNAIL, LAYER_CONFIG, Z_INDEX } from "@/constants/spread-constants";
import { useCanvasWidth, useCanvasAspectRatio } from "@/stores/editor-settings-store";
import type {
  BaseSpread,
  ItemType,
  ImageItemContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AudioItemContext,
  QuizItemContext,
  SpreadImage,
  SpreadVideo,
  SpreadAudio,
  SpreadQuiz,
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

  // Raw item render functions (illustration layer)
  renderRawImage?: (context: ImageItemContext<TSpread>) => ReactNode;
  renderRawTextbox?: (context: TextItemContext<TSpread>) => ReactNode;

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
  renderRawImage,
  renderRawTextbox,
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
  const canvasWidth = useCanvasWidth();
  const canvasAspectRatio = useCanvasAspectRatio();

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
  const scale = effectiveWidth > 0 ? effectiveWidth / canvasWidth : 0;

  // Page label
  const label = useMemo(() => {
    if (spread.pages.length === 1) {
      return `Page ${spread.pages[0].number}`;
    }
    return `Pages ${spread.pages[0].number}-${spread.pages[1].number}`;
  }, [spread.pages]);

  // Resolve z-index per item mirroring spread-editor-panel logic so thumbnails
  // respect the same stacking order as the main canvas. Fallbacks follow
  // LAYER_CONFIG so items without explicit "z-index" still stack predictably.
  const rawImageCount = spread.raw_images?.length ?? 0;
  const rawTextboxCount = spread.raw_textboxes?.length ?? 0;
  const playableImageCount = spread.images?.length ?? 0;
  const totalImageCount = Math.max(rawImageCount, playableImageCount);
  const shapesCount = spread.shapes?.length ?? 0;
  const audiosCount = spread.audios?.length ?? 0;

  // Memoize raw image contexts (illustration layer, below all editable layers)
  const rawImageContexts = useMemo(() => {
    if (!renderItems.includes("raw_image") || !renderRawImage) return [];
    return (spread.raw_images ?? []).map((img, idx) => {
      const context = buildViewOnlyImageContext(img, idx, spread);
      context.zIndex = -rawImageCount + idx;
      return { image: img, context };
    });
  }, [spread.raw_images, spread.id, renderItems, renderRawImage, rawImageCount]);

  // Memoize image contexts (playable layer)
  const imageContexts = useMemo(() => {
    if (!renderItems.includes("image") || !renderImageItem) return [];
    return (spread.images ?? []).map((img, idx) => {
      const context = buildViewOnlyImageContext(img, idx, spread);
      context.zIndex =
        (img as SpreadImage)["z-index"] ?? LAYER_CONFIG.MEDIA.min + idx;
      return { image: img, context };
    });
  }, [spread.images, spread.id, renderItems, renderImageItem]);

  // Memoize raw textbox contexts (illustration layer, above raw images, below editable)
  const rawTextboxContexts = useMemo(() => {
    if (!renderItems.includes("raw_textbox") || !renderRawTextbox) return [];
    return (spread.raw_textboxes ?? []).map((textbox, idx) => {
      const context = buildViewOnlyTextContext(textbox, idx, spread);
      context.zIndex = -rawImageCount + rawTextboxCount + idx;
      return { textbox, context };
    });
  }, [
    spread.raw_textboxes,
    spread.id,
    renderItems,
    renderRawTextbox,
    rawImageCount,
    rawTextboxCount,
  ]);

  // Memoize text contexts (playable layer)
  const textContexts = useMemo(() => {
    if (!renderItems.includes("textbox") || !renderTextItem) return [];
    return (spread.textboxes ?? []).map((textbox, idx) => {
      const context = buildViewOnlyTextContext(textbox, idx, spread);
      context.zIndex =
        (textbox as { "z-index"?: number })["z-index"] ??
        LAYER_CONFIG.TEXT.min + idx;
      return { textbox, context };
    });
  }, [spread.textboxes, spread.id, renderItems, renderTextItem]);

  // Memoize shape contexts - shapes are playable-only (no raw shapes)
  const shapeContexts = useMemo(() => {
    if (!renderItems.includes("shape") || !renderShapeItem || !spread.shapes)
      return [];
    return spread.shapes.map((shape, idx) => {
      const context = buildViewOnlyShapeContext(shape, idx, spread);
      context.zIndex =
        (shape as { "z-index"?: number })["z-index"] ??
        LAYER_CONFIG.OBJECTS.min + idx;
      return { shape, context };
    });
  }, [spread.shapes, spread.id, renderItems, renderShapeItem]);

  // Memoize video contexts - skip if renderVideoItem not provided
  const videoContexts = useMemo(() => {
    if (!renderItems.includes("video") || !renderVideoItem || !spread.videos)
      return [];
    return spread.videos.map((video, idx) => {
      const context = buildViewOnlyVideoContext(video, idx, spread);
      context.zIndex =
        (video as SpreadVideo)["z-index"] ??
        LAYER_CONFIG.MEDIA.min + totalImageCount + idx;
      return { video, context };
    });
  }, [
    spread.videos,
    spread.id,
    renderItems,
    renderVideoItem,
    totalImageCount,
  ]);

  // Memoize audio contexts - skip if renderAudioItem not provided
  const audioContexts = useMemo(() => {
    if (!renderItems.includes("audio") || !renderAudioItem || !spread.audios)
      return [];
    return spread.audios.map((audio, idx) => {
      const context = buildViewOnlyAudioContext(audio, idx, spread);
      context.zIndex =
        (audio as SpreadAudio)["z-index"] ??
        LAYER_CONFIG.OBJECTS.min + shapesCount + idx;
      return { audio, context };
    });
  }, [spread.audios, spread.id, renderItems, renderAudioItem, shapesCount]);

  // Memoize quiz contexts - skip if renderQuizItem not provided
  const quizContexts = useMemo(() => {
    if (!renderItems.includes("quiz") || !renderQuizItem || !spread.quizzes)
      return [];
    return spread.quizzes.map((quiz, idx) => {
      const context = buildViewOnlyQuizContext(quiz, idx, spread);
      context.zIndex =
        (quiz as SpreadQuiz)["z-index"] ??
        LAYER_CONFIG.OBJECTS.min + shapesCount + audiosCount + idx;
      return { quiz, context };
    });
  }, [
    spread.quizzes,
    spread.id,
    renderItems,
    renderQuizItem,
    shapesCount,
    audiosCount,
  ]);

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
          // Maintain canvas aspect ratio regardless of container width
          aspectRatio: `${canvasAspectRatio}`,
          // Small size: fixed width, Medium: responsive (aspectRatio handles height)
          ...(size === "small" && { width: THUMBNAIL.SMALL_WIDTH }),
          contain: "layout style paint",
        }}
      >
        {/* Scaled Content: render at canvas size, scale down to fit container */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: canvasWidth,
            height: canvasWidth / canvasAspectRatio,
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
                  zIndex: Z_INDEX.PAGE_BACKGROUND,
                }}
              />
            );
          })}

          {/* Page Divider — always visible, khớp với spread-editor-panel */}
          <div
            className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-300"
            style={{ zIndex: Z_INDEX.PAGE_BACKGROUND }}
          />

          {/* NOTE: Items render via Fragment (not wrapper div) so each item's
              resolved z-index stacks within the scaled-content stacking
              context. A wrapper div is not positioned and would force items
              into DOM-order flow on browsers that collapse z-index across
              sibling subtrees. */}

          {/* Raw Images (illustration layer, view-only) */}
          {renderRawImage &&
            rawImageContexts.map(({ image, context }, index) => (
              <Fragment key={image.id || `raw-img-${index}`}>
                {renderRawImage(context)}
              </Fragment>
            ))}

          {/* Images (playable layer, view-only) */}
          {renderImageItem &&
            imageContexts.map(({ image, context }, index) => (
              <Fragment key={image.id || `img-${index}`}>
                {renderImageItem(context)}
              </Fragment>
            ))}

          {/* Videos (view-only) - skip if renderVideoItem not provided */}
          {renderVideoItem &&
            videoContexts.map(({ video, context }, index) => (
              <Fragment key={video.id || `vid-${index}`}>
                {renderVideoItem(context)}
              </Fragment>
            ))}

          {/* Shapes (view-only) - skip if renderShapeItem not provided */}
          {renderShapeItem &&
            shapeContexts.map(({ shape, context }, index) => (
              <Fragment key={shape.id || `shp-${index}`}>
                {renderShapeItem(context)}
              </Fragment>
            ))}

          {/* Raw Textboxes (illustration layer, view-only) */}
          {renderRawTextbox &&
            rawTextboxContexts.map(({ textbox, context }, index) => (
              <Fragment key={textbox.id || `raw-txt-${index}`}>
                {renderRawTextbox(context)}
              </Fragment>
            ))}

          {/* Textboxes (playable layer, view-only) */}
          {renderTextItem &&
            textContexts.map(({ textbox, context }, index) => (
              <Fragment key={textbox.id || `txt-${index}`}>
                {renderTextItem(context)}
              </Fragment>
            ))}

          {/* Audios (view-only) - skip if renderAudioItem not provided */}
          {renderAudioItem &&
            audioContexts.map(({ audio, context }, index) => (
              <Fragment key={audio.id || `aud-${index}`}>
                {renderAudioItem(context)}
              </Fragment>
            ))}

          {/* Quizzes (view-only) - skip if renderQuizItem not provided */}
          {renderQuizItem &&
            quizContexts.map(({ quiz, context }, index) => (
              <Fragment key={quiz.id || `quiz-${index}`}>
                {renderQuizItem(context)}
              </Fragment>
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
