// spread-editor-panel.tsx - Main editor canvas for selected spread
"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  Fragment,
  type ReactNode,
} from "react";
import { SelectionFrame } from "./selection-frame";
import { PageItem } from "./page-item";
import {
  buildImageContext,
  buildTextContext,
  buildTextToolbarContext,
  buildShapeContext,
  buildVideoContext,
  buildAudioContext,
  buildQuizContext,
} from "./utils/context-builders";
import {
  applyDragDelta,
  applyResizeDelta,
  applyAspectLockedResize,
  applyNudge,
} from "./utils/geometry-utils";
import { getScaledDimensions } from "./utils/coordinate-utils";
import { CANVAS, LAYER_CONFIG } from "@/constants/spread-constants";
import type {
  BaseSpread,
  SpreadTextbox,
  SpreadImage,
  SpreadVideo,
  SpreadAudio,
  SpreadQuiz,
  ItemType,
  SelectedElement,
  ResizeHandle,
  Point,
  Geometry,
  ImageItemContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AudioItemContext,
  QuizItemContext,
  ImageToolbarContext,
  TextToolbarContext,
  PageToolbarContext,
  ShapeToolbarContext,
  VideoToolbarContext,
  AudioToolbarContext,
  LayoutOption,
  SpreadItemActionUnion,
} from "@/types/canvas-types";
import { getTextboxContentForLanguage } from "../../utils/textbox-helpers";
import { useLanguageCode } from "@/stores/editor-settings-store";
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SpreadEditorPanel');

// Fixed pixel size of audio/quiz icon elements (w-8 h-8 = 32px)
const ICON_ELEMENT_PX = 32;

// === Raw + Playable layer helpers ===
// Images and textboxes exist in two layers:
//   raw_images/raw_textboxes  — illustration phase (editor-only art)
//   images/textboxes          — playable phase (interactive objects)
// Combined index: raw items occupy [0..rawCount-1], playable items [rawCount..rawCount+playableCount-1]

function getImageAtIndex<TSpread extends BaseSpread>(spread: TSpread, index: number): SpreadImage | undefined {
  const raw = spread.raw_images ?? [];
  return index < raw.length ? raw[index] : spread.images[index - raw.length];
}

function getTextboxAtIndex<TSpread extends BaseSpread>(spread: TSpread, index: number): SpreadTextbox | undefined {
  const raw = spread.raw_textboxes ?? [];
  return index < raw.length ? raw[index] : spread.textboxes[index - raw.length];
}

function resolveImageIndex<TSpread extends BaseSpread>(spread: TSpread, id: string): number {
  const raw = spread.raw_images ?? [];
  const rawIdx = raw.findIndex((img) => img.id === id);
  if (rawIdx >= 0) return rawIdx;
  const playableIdx = spread.images.findIndex((img) => img.id === id);
  return playableIdx >= 0 ? raw.length + playableIdx : -1;
}

function resolveTextboxIndex<TSpread extends BaseSpread>(spread: TSpread, id: string): number {
  const raw = spread.raw_textboxes ?? [];
  const rawIdx = raw.findIndex((tb) => tb.id === id);
  if (rawIdx >= 0) return rawIdx;
  const playableIdx = spread.textboxes.findIndex((tb) => tb.id === id);
  return playableIdx >= 0 ? raw.length + playableIdx : -1;
}

// === Props Interface ===
interface SpreadEditorPanelProps<TSpread extends BaseSpread> {
  // Data
  spread: TSpread;
  spreadIndex: number; // Currently unused, reserved for future features (e.g., spread navigation)

  // View config
  zoomLevel: number;
  isEditable: boolean;

  // Render configuration
  renderItems: ItemType[];

  // Item render functions (optional - skip rendering if not provided)
  renderImageItem?: (context: ImageItemContext<TSpread>) => ReactNode;
  renderTextItem?: (context: TextItemContext<TSpread>) => ReactNode;
  renderShapeItem?: (context: ShapeItemContext<TSpread>) => ReactNode;
  renderVideoItem?: (context: VideoItemContext<TSpread>) => ReactNode;
  renderAudioItem?: (context: AudioItemContext<TSpread>) => ReactNode;
  renderQuizItem?: (context: QuizItemContext<TSpread>) => ReactNode;

  // Toolbar render functions (optional)
  renderImageToolbar?: (context: ImageToolbarContext<TSpread>) => ReactNode;
  renderTextToolbar?: (context: TextToolbarContext<TSpread>) => ReactNode;
  renderPageToolbar?: (context: PageToolbarContext<TSpread>) => ReactNode;
  renderShapeToolbar?: (context: ShapeToolbarContext<TSpread>) => ReactNode;
  renderVideoToolbar?: (context: VideoToolbarContext<TSpread>) => ReactNode;
  renderAudioToolbar?: (context: AudioToolbarContext<TSpread>) => ReactNode;

  // Callbacks
  onSpreadItemAction?: (
    params: Omit<SpreadItemActionUnion, "spreadId">
  ) => void;

  // Item-level feature flags
  canDeleteItem?: boolean;
  canResizeItem?: boolean;
  canDragItem?: boolean;

  // Layout config
  availableLayouts?: LayoutOption[];

  // External selection sync (sidebar → canvas)
  externalSelectedItemId?: { type: string; id: string } | null;
}

// === Local State Interface ===
interface EditorState {
  selectedElement: SelectedElement | null;
  selectedGeometry: Geometry | null; // For toolbar positioning
  isTextboxEditing: boolean;
  isImageEditing: boolean;
  isDragging: boolean;
  isResizing: boolean;
  activeHandle: ResizeHandle | null;
  originalGeometry: Geometry | null;
}

// === Main Component ===
export function SpreadEditorPanel<TSpread extends BaseSpread>({
  spread,
  zoomLevel,
  isEditable,
  renderItems,
  renderImageItem,
  renderTextItem,
  renderShapeItem,
  renderVideoItem,
  renderAudioItem,
  renderQuizItem,
  renderImageToolbar,
  renderTextToolbar,
  renderPageToolbar,
  renderShapeToolbar,
  renderVideoToolbar,
  renderAudioToolbar,
  onSpreadItemAction,
  canDeleteItem = false,
  canResizeItem = true,
  canDragItem = true,
  availableLayouts = [],
  externalSelectedItemId,
}: SpreadEditorPanelProps<TSpread>) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorLangCode = useLanguageCode();
  // Ref for originalGeometry to avoid stale closures in drag/resize handlers.
  // React batches setState from handleResizeStart, so handleResize may still
  // capture old state where originalGeometry is null. The ref is mutated
  // synchronously and always reflects the latest value.
  const originalGeometryRef = useRef<Geometry | null>(null);

  // Compute geometry for icon-based elements (audio/quiz) — converts fixed
  // pixel size to percentage relative to the canvas container's actual dimensions.
  const computeIconGeometry = useCallback((baseGeo: Geometry): Geometry => {
    const canvas = canvasRef.current;
    if (!canvas) return baseGeo;
    const w = (ICON_ELEMENT_PX / canvas.clientWidth) * 100;
    const h = (ICON_ELEMENT_PX / canvas.clientHeight) * 100;
    return { x: baseGeo.x, y: baseGeo.y, w, h };
  }, []);

  // Local state
  const [state, setState] = useState<EditorState>({
    selectedElement: null,
    selectedGeometry: null,
    isTextboxEditing: false,
    isImageEditing: false,
    isDragging: false,
    isResizing: false,
    activeHandle: null,
    originalGeometry: null,
  });

  // Reset selection when switching to different spread
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      selectedElement: null,
      selectedGeometry: null,
      isTextboxEditing: false,
      isImageEditing: false,
      isDragging: false,
      isResizing: false,
      activeHandle: null,
      originalGeometry: null,
    }));
  }, [spread.id]);

  // Sync external selection (sidebar → canvas): resolve item id to array index
  useEffect(() => {
    if (!externalSelectedItemId) return;
    const { type, id } = externalSelectedItemId;

    let resolvedType: SelectedElement["type"] | null = null;
    let index = -1;

    if (type === "image") {
      resolvedType = "image";
      // Search raw_images first (illustration layer), then images (playable layer) with offset
      index = resolveImageIndex(spread, id);
    } else if (type === "text") {
      resolvedType = "textbox";
      // Search raw_textboxes first (illustration layer), then textboxes (playable layer) with offset
      index = resolveTextboxIndex(spread, id);
    } else if (type === "shape") {
      resolvedType = "shape";
      index = (spread.shapes ?? []).findIndex((s) => s.id === id);
    } else if (type === "video") {
      resolvedType = "video";
      index = (spread.videos ?? []).findIndex((v) => v.id === id);
    } else if (type === "audio") {
      resolvedType = "audio";
      index = (spread.audios ?? []).findIndex((a) => a.id === id);
    } else if (type === "quiz") {
      resolvedType = "quiz";
      index = (spread.quizzes ?? []).findIndex((q) => q.id === id);
    }

    if (resolvedType && index >= 0) {
      const element: SelectedElement = { type: resolvedType, index };
      setState((prev) => {
        if (prev.selectedElement?.type === element.type && prev.selectedElement?.index === element.index) {
          return prev; // No change, skip re-render
        }
        // Resolve geometry for the selection frame
        let geometry: Geometry | null = null;
        if (element.type === "image") geometry = getImageAtIndex(spread, element.index)?.geometry ?? null;
        else if (element.type === "textbox") {
          const tb = getTextboxAtIndex(spread, element.index);
          const tbResult = getTextboxContentForLanguage(tb || {}, editorLangCode);
          geometry = tbResult?.content?.geometry ?? null;
        }
        else if (element.type === "shape") geometry = spread.shapes?.[element.index]?.geometry ?? null;
        else if (element.type === "video") geometry = spread.videos?.[element.index]?.geometry ?? null;
        else if (element.type === "audio") {
          const audioGeo = spread.audios?.[element.index]?.geometry;
          geometry = audioGeo ? computeIconGeometry(audioGeo) : null;
        }
        else if (element.type === "quiz") {
          const quizGeo = spread.quizzes?.[element.index]?.geometry;
          geometry = quizGeo ? computeIconGeometry(quizGeo) : null;
        }

        return { ...prev, selectedElement: element, selectedGeometry: geometry, isDragging: false, isResizing: false, activeHandle: null, originalGeometry: null };
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSelectedItemId?.type, externalSelectedItemId?.id, spread]);

  // Click outside to deselect
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!state.selectedElement) return;
      if (!canvasRef.current) return;

      const target = e.target as Element;
      // Check if click is inside canvas
      if (canvasRef.current.contains(target)) return;
      // Check if click is inside a toolbar or its children (portaled to body)
      if (target.closest?.("[data-toolbar]")) return;
      // Check if click is inside Radix UI portals (Select, Popover, Dialog, etc.)
      if (
        target.closest?.(
          '[data-radix-popper-content-wrapper], [data-radix-select-content], [data-radix-popover-content], [role="listbox"], [role="dialog"]'
        )
      )
        return;

      setState((prev) => ({
        ...prev,
        selectedElement: null,
        selectedGeometry: null,
      }));
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state.selectedElement]);

  // Scaled dimensions
  const { width: scaledWidth, height: scaledHeight } =
    getScaledDimensions(zoomLevel);

  // === Selection Handlers ===
  const handleElementSelect = useCallback(
    (element: SelectedElement | null) => {
      log.info('handleElementSelect', 'element selected', { type: element?.type ?? null, index: element?.index ?? null });
      let geometry: Geometry | null = null;

      if (element) {
        if (element.type === "image") {
          geometry = getImageAtIndex(spread, element.index)?.geometry ?? null;
        } else if (element.type === "textbox") {
          const item = getTextboxAtIndex(spread, element.index);
          const tbResult = getTextboxContentForLanguage(item || {}, editorLangCode);
          geometry = tbResult?.content?.geometry ?? null;
        } else if (element.type === "shape") {
          geometry = spread.shapes?.[element.index]?.geometry ?? null;
        } else if (element.type === "video") {
          geometry = spread.videos?.[element.index]?.geometry ?? null;
        } else if (element.type === "audio") {
          const audioGeo = spread.audios?.[element.index]?.geometry;
          geometry = audioGeo ? computeIconGeometry(audioGeo) : null;
        } else if (element.type === "quiz") {
          const quizGeo = spread.quizzes?.[element.index]?.geometry;
          geometry = quizGeo ? computeIconGeometry(quizGeo) : null;
        }
      }

      setState((prev) => ({
        ...prev,
        selectedElement: element,
        selectedGeometry: geometry,
        isDragging: false,
        isResizing: false,
        activeHandle: null,
        originalGeometry: null,
      }));
    },
    [spread, computeIconGeometry]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current) {
        handleElementSelect(null);
      }
    },
    [handleElementSelect]
  );

  // === Geometry Access ===
  const getSelectedGeometry = useCallback((): Geometry | null => {
    const { selectedElement } = state;
    if (!selectedElement) return null;

    switch (selectedElement.type) {
      case "image":
        return getImageAtIndex(spread, selectedElement.index)?.geometry ?? null;
      case "textbox": {
        const tb = getTextboxAtIndex(spread, selectedElement.index);
        if (!tb) return null;
        const tbResult = getTextboxContentForLanguage(tb, editorLangCode);
        return tbResult?.content?.geometry ?? null;
      }
      case "shape":
        return spread.shapes?.[selectedElement.index]?.geometry ?? null;
      case "video":
        return spread.videos?.[selectedElement.index]?.geometry ?? null;
      case "audio": {
        const audioGeo = spread.audios?.[selectedElement.index]?.geometry;
        return audioGeo ? computeIconGeometry(audioGeo) : null;
      }
      case "quiz": {
        const quizGeo = spread.quizzes?.[selectedElement.index]?.geometry;
        return quizGeo ? computeIconGeometry(quizGeo) : null;
      }
      default:
        return null;
    }
  }, [state, spread, computeIconGeometry]);

  // === Geometry Update ===
  const updateElementGeometry = useCallback(
    (element: SelectedElement, geometry: Geometry) => {
      if (!onSpreadItemAction) return;

      switch (element.type) {
        case "image": {
          // Combined index: raw images first, then playable images
          const image = getImageAtIndex(spread, element.index);
          if (!image?.id) return;
          onSpreadItemAction({
            itemType: "image",
            action: "update",
            itemId: image.id,
            data: { geometry },
          });
          break;
        }
        case "textbox": {
          // Combined index: raw textboxes first, then playable textboxes
          const tb = getTextboxAtIndex(spread, element.index);
          if (!tb?.id) return;
          const tbResult = getTextboxContentForLanguage(tb, editorLangCode);
          if (tbResult) {
            onSpreadItemAction({
              itemType: "textbox",
              action: "update",
              itemId: tb.id,
              data: {
                [tbResult.langKey]: { ...tbResult.content, geometry },
              } as Partial<SpreadTextbox>,
            });
          }
          break;
        }
        case "shape": {
          const shape = spread.shapes?.[element.index];
          if (!shape?.id) return;
          onSpreadItemAction({
            itemType: "shape",
            action: "update",
            itemId: shape.id,
            data: { geometry },
          });
          break;
        }
        case "video": {
          const video = spread.videos?.[element.index];
          if (!video?.id) return;
          onSpreadItemAction({
            itemType: "video",
            action: "update",
            itemId: video.id,
            data: { geometry },
          });
          break;
        }
        case "audio": {
          const audio = spread.audios?.[element.index];
          if (!audio?.id) return;
          onSpreadItemAction({
            itemType: "audio",
            action: "update",
            itemId: audio.id,
            data: { geometry },
          });
          break;
        }
        case "quiz": {
          const quiz = spread.quizzes?.[element.index];
          if (!quiz?.id) return;
          onSpreadItemAction({
            itemType: "quiz",
            action: "update",
            itemId: quiz.id,
            data: { geometry },
          });
          break;
        }
      }
    },
    [
      spread.raw_images,
      spread.raw_textboxes,
      spread.images,
      spread.textboxes,
      spread.shapes,
      spread.videos,
      spread.audios,
      spread.quizzes,
      onSpreadItemAction,
    ]
  );

  // === Drag Handlers ===
  const handleDragStart = useCallback(() => {
    log.debug('handleDragStart', 'drag started');
    const geometry = getSelectedGeometry();
    originalGeometryRef.current = geometry;
    setState((prev) => ({
      ...prev,
      isDragging: true,
      originalGeometry: geometry,
    }));
  }, [getSelectedGeometry]);

  const handleDrag = useCallback(
    (delta: Point) => {
      const { selectedElement } = state;
      const originalGeometry = originalGeometryRef.current;
      if (!selectedElement || !originalGeometry) return;

      const newGeometry = applyDragDelta(originalGeometry, delta.x, delta.y);
      updateElementGeometry(selectedElement, newGeometry);

      // Update selectedGeometry for toolbar positioning
      setState((prev) => ({ ...prev, selectedGeometry: newGeometry }));
    },
    [state, updateElementGeometry]
  );

  const handleDragEnd = useCallback(() => {
    originalGeometryRef.current = null;
    setState((prev) => ({
      ...prev,
      isDragging: false,
      originalGeometry: null,
    }));
  }, []);

  // === Resize Handlers ===
  const handleResizeStart = useCallback(
    (handle: ResizeHandle) => {
      const geometry = getSelectedGeometry();
      originalGeometryRef.current = geometry;
      setState((prev) => ({
        ...prev,
        isResizing: true,
        activeHandle: handle,
        originalGeometry: geometry,
      }));
    },
    [getSelectedGeometry]
  );

  const handleResize = useCallback(
    (handle: ResizeHandle, delta: Point) => {
      const { selectedElement } = state;
      const originalGeometry = originalGeometryRef.current;
      if (!selectedElement || !originalGeometry) return;

      let newGeometry: Geometry;

      // Image/Video: aspect-ratio-locked resize with proper anchor handling
      if (selectedElement.type === "image" || selectedElement.type === "video") {
        const aspect = originalGeometry.w / originalGeometry.h;
        newGeometry = applyAspectLockedResize(
          originalGeometry,
          handle,
          delta.x,
          delta.y,
          aspect
        );
      } else {
        newGeometry = applyResizeDelta(
          originalGeometry,
          handle,
          delta.x,
          delta.y
        );
      }

      updateElementGeometry(selectedElement, newGeometry);

      // Update selectedGeometry for toolbar positioning
      setState((prev) => ({ ...prev, selectedGeometry: newGeometry }));
    },
    [state, updateElementGeometry]
  );

  const handleResizeEnd = useCallback(() => {
    originalGeometryRef.current = null;
    setState((prev) => ({
      ...prev,
      isResizing: false,
      activeHandle: null,
      originalGeometry: null,
    }));
  }, []);

  // === Editing Handlers ===
  const handleTextboxEditingChange = useCallback((isEditing: boolean) => {
    setState((prev) => ({ ...prev, isTextboxEditing: isEditing }));
  }, []);

  const handleImageEditingChange = useCallback((isEditing: boolean) => {
    setState((prev) => ({ ...prev, isImageEditing: isEditing }));
  }, []);

  // === Keyboard Handlers ===
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const { selectedElement, isDragging, isResizing } = state;
      if (!selectedElement || !isEditable) return;

      // Handle ESC first - works for all selection types including page
      if (e.key === "Escape") {
        e.preventDefault();
        const origGeo = originalGeometryRef.current;
        if ((isDragging || isResizing) && origGeo) {
          updateElementGeometry(selectedElement, origGeo);
          originalGeometryRef.current = null;
          setState((prev) => ({
            ...prev,
            isDragging: false,
            isResizing: false,
            activeHandle: null,
            originalGeometry: null,
            selectedGeometry: origGeo,
          }));
        } else {
          handleElementSelect(null);
        }
        return;
      }

      switch (e.key) {
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          if (state.isTextboxEditing || state.isImageEditing) return;
          if (!canDragItem) return;
          const geometry = getSelectedGeometry();
          if (!geometry) return;
          e.preventDefault();
          const step = e.shiftKey ? CANVAS.NUDGE_STEP_SHIFT : CANVAS.NUDGE_STEP;
          const direction =
            e.key === "ArrowUp"
              ? "up"
              : e.key === "ArrowDown"
              ? "down"
              : e.key === "ArrowLeft"
              ? "left"
              : "right";
          updateElementGeometry(
            selectedElement,
            applyNudge(geometry, direction, step)
          );
          break;
        }
        case "Delete":
        case "Backspace":
          // Don't delete element if user is editing text
          if (
            canDeleteItem &&
            !state.isTextboxEditing &&
            !state.isImageEditing &&
            onSpreadItemAction
          ) {
            if (selectedElement.type === "image") {
              // Combined index: raw images first, then playable images
              const image = getImageAtIndex(spread, selectedElement.index);
              if (image?.id) {
                onSpreadItemAction({
                  itemType: "image",
                  action: "delete",
                  itemId: image.id,
                  data: null,
                });
              }
            }
            if (selectedElement.type === "textbox") {
              // Combined index: raw textboxes first, then playable textboxes
              const textbox = getTextboxAtIndex(spread, selectedElement.index);
              if (textbox?.id) {
                onSpreadItemAction({
                  itemType: "textbox",
                  action: "delete",
                  itemId: textbox.id,
                  data: null,
                });
              }
            }
            if (selectedElement.type === "shape") {
              const shape = spread.shapes?.[selectedElement.index];
              if (shape?.id) {
                onSpreadItemAction({
                  itemType: "shape",
                  action: "delete",
                  itemId: shape.id,
                  data: null,
                });
              }
            }
            if (selectedElement.type === "video") {
              const video = spread.videos?.[selectedElement.index];
              if (video?.id) {
                onSpreadItemAction({
                  itemType: "video",
                  action: "delete",
                  itemId: video.id,
                  data: null,
                });
              }
            }
            if (selectedElement.type === "audio") {
              const audio = spread.audios?.[selectedElement.index];
              if (audio?.id) {
                onSpreadItemAction({
                  itemType: "audio",
                  action: "delete",
                  itemId: audio.id,
                  data: null,
                });
              }
            }
            if (selectedElement.type === "quiz") {
              const quiz = spread.quizzes?.[selectedElement.index];
              if (quiz?.id) {
                onSpreadItemAction({
                  itemType: "quiz",
                  action: "delete",
                  itemId: quiz.id,
                  data: null,
                });
              }
            }
            handleElementSelect(null);
          }
          break;
      }
    },
    [
      state,
      isEditable,
      getSelectedGeometry,
      updateElementGeometry,
      handleElementSelect,
      canDeleteItem,
      canDragItem,
      onSpreadItemAction,
      spread.raw_images,
      spread.raw_textboxes,
      spread.images,
      spread.textboxes,
      spread.shapes,
      spread.videos,
      spread.audios,
      spread.quizzes,
    ]
  );

  // === Wrapper callback for page updates (used by PageItem) ===
  const handleUpdatePage = useCallback(
    (pageIndex: number, updates: Partial<TSpread["pages"][number]>) => {
      if (!onSpreadItemAction) return;
      onSpreadItemAction({
        itemType: "page",
        action: "update",
        itemId: pageIndex,
        data: updates,
      });
    },
    [onSpreadItemAction]
  );

  // Unified action handler for context builders
  const handleSpreadItemAction = useCallback(
    (params: Omit<SpreadItemActionUnion, "spreadId">) => {
      onSpreadItemAction?.(params);
    },
    [onSpreadItemAction]
  );

  // === Render ===
  const selectedGeometry = getSelectedGeometry();
  // Audio/Quiz are fixed-size icons — disable resize, only allow drag
  const isIconElement = state.selectedElement?.type === "audio" || state.selectedElement?.type === "quiz";
  const canResizeCurrentItem = canResizeItem && !isIconElement;
  const showHandles = canResizeCurrentItem && !state.isDragging;

  return (
    <div
      className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/30"
      role="application"
      aria-label="Spread editor"
    >
      <div
        ref={canvasRef}
        className="relative bg-white shadow-lg"
        style={{
          width: scaledWidth,
          height: scaledHeight,
          willChange: "transform",
        }}
        onClick={handleCanvasClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Page Backgrounds */}
        {spread.pages.map((page, pageIndex) => (
          <PageItem
            key={pageIndex}
            page={page}
            pageIndex={pageIndex}
            spread={spread}
            spreadId={spread.id}
            position={
              spread.pages.length === 1
                ? "single"
                : pageIndex === 0
                ? "left"
                : "right"
            }
            isSelected={
              state.selectedElement?.type === "page" &&
              state.selectedElement.index === pageIndex
            }
            onSelect={
              renderPageToolbar
                ? () => handleElementSelect({ type: "page", index: pageIndex })
                : undefined
            }
            onUpdatePage={(updates) => handleUpdatePage(pageIndex, updates)}
            renderPageToolbar={renderPageToolbar}
            availableLayouts={availableLayouts}
          />
        ))}

        {/* Page Divider */}
        {spread.pages.length > 1 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-300"
            style={{ left: "50%", zIndex: 0 }}
          />
        )}

        {/* Images: render raw layer (illustration phase) then playable layer (retouch phase).
            Combined index: raw images occupy [0..rawCount-1], playable images [rawCount..]. */}
        {renderItems.includes("image") &&
          renderImageItem &&
          [...(spread.raw_images ?? []), ...spread.images].map((image, combinedIndex) => {
            const context = buildImageContext(
              image,
              combinedIndex,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction,
              handleImageEditingChange
            );
            context.zIndex = (image as SpreadImage)['z-index'] ?? (LAYER_CONFIG.MEDIA.min + combinedIndex);
            return <Fragment key={image.id ?? `img-${combinedIndex}`}>{renderImageItem(context)}</Fragment>;
          })}

        {/* Videos */}
        {renderItems.includes("video") &&
          renderVideoItem &&
          spread.videos?.map((video, index) => {
            const context = buildVideoContext(
              video,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction
            );
            // Offset by total images (raw + playable) so videos stack above all images
            const totalImageCount = (spread.raw_images?.length ?? 0) + spread.images.length;
            context.zIndex = (video as SpreadVideo)['z-index'] ?? (LAYER_CONFIG.MEDIA.min + totalImageCount + index);
            return <Fragment key={video.id ?? `vid-${index}`}>{renderVideoItem(context)}</Fragment>;
          })}

        {/* Shapes */}
        {renderItems.includes("shape") &&
          renderShapeItem &&
          spread.shapes?.map((shape, index) => {
            const context = buildShapeContext(
              shape,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction
            );
            context.zIndex = (shape as { 'z-index'?: number })['z-index'] ?? (LAYER_CONFIG.OBJECTS.min + index);
            return <Fragment key={shape.id ?? `shp-${index}`}>{renderShapeItem(context)}</Fragment>;
          })}

        {/* Textboxes: render raw layer (illustration phase) then playable layer (retouch phase).
            Combined index: raw textboxes occupy [0..rawCount-1], playable textboxes [rawCount..]. */}
        {renderItems.includes("textbox") &&
          renderTextItem &&
          [...(spread.raw_textboxes ?? []), ...spread.textboxes].map((textbox, combinedIndex) => {
            const context = buildTextContext(
              textbox,
              combinedIndex,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction,
              handleTextboxEditingChange,
              editorLangCode
            );
            context.zIndex = (textbox as { 'z-index'?: number })['z-index'] ?? (LAYER_CONFIG.TEXT.min + combinedIndex);
            return <Fragment key={textbox.id ?? `txt-${combinedIndex}`}>{renderTextItem(context)}</Fragment>;
          })}

        {/* Audios */}
        {renderItems.includes("audio") &&
          renderAudioItem &&
          spread.audios?.map((audio, index) => {
            const context = buildAudioContext(
              audio,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction
            );
            const shapesCount = spread.shapes?.length ?? 0;
            context.zIndex = (audio as SpreadAudio)['z-index'] ?? (LAYER_CONFIG.OBJECTS.min + shapesCount + index);
            return <Fragment key={audio.id ?? `aud-${index}`}>{renderAudioItem(context)}</Fragment>;
          })}

        {/* Quizzes */}
        {renderItems.includes("quiz") &&
          renderQuizItem &&
          spread.quizzes?.map((quiz, index) => {
            const context = buildQuizContext(
              quiz,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction
            );
            const shapesCount = spread.shapes?.length ?? 0;
            const audiosCount = spread.audios?.length ?? 0;
            context.zIndex = (quiz as SpreadQuiz)['z-index'] ?? (LAYER_CONFIG.OBJECTS.min + shapesCount + audiosCount + index);
            return <Fragment key={quiz.id ?? `quiz-${index}`}>{renderQuizItem(context)}</Fragment>;
          })}

        {/* Selection Frame - frame border allows drag, center passes through for editing */}
        {state.selectedElement &&
          selectedGeometry &&
          isEditable &&
          state.selectedElement.type !== "page" && (
            <SelectionFrame
              geometry={selectedGeometry}
              zoomLevel={zoomLevel}
              showHandles={showHandles}
              activeHandle={state.activeHandle}
              canDrag={canDragItem}
              canResize={canResizeCurrentItem}
              borderOnlyDrag={state.selectedElement?.type === "textbox"}
              onDragStart={handleDragStart}
              onDrag={handleDrag}
              onDragEnd={handleDragEnd}
              onResizeStart={handleResizeStart}
              onResize={handleResize}
              onResizeEnd={handleResizeEnd}
            />
          )}

        {/* Toolbars (rendered by consumer) */}
        {state.selectedElement &&
          isEditable &&
          (() => {
            const { selectedElement } = state;

            if (selectedElement.type === "image" && renderImageToolbar) {
              // Combined index: raw images first, then playable images
              const image = getImageAtIndex(spread, selectedElement.index);
              if (!image) return null;
              const context = buildImageContext(
                image,
                selectedElement.index,
                spread,
                selectedElement,
                handleElementSelect,
                handleSpreadItemAction
              );
              return renderImageToolbar({
                ...context,
                selectedGeometry: state.selectedGeometry,
                canvasRef,
                onGenerateImage: () => {},
                onReplaceImage: () => {},
              });
            }

            if (selectedElement.type === "textbox" && renderTextToolbar) {
              // Combined index: raw textboxes first, then playable textboxes
              const textbox = getTextboxAtIndex(spread, selectedElement.index);
              if (!textbox) return null;

              const context = buildTextToolbarContext(
                textbox,
                selectedElement.index,
                spread,
                selectedElement,
                handleElementSelect,
                handleSpreadItemAction,
                canvasRef,
                state.selectedGeometry,
                undefined,
                editorLangCode
              );

              return renderTextToolbar(context);
            }

            if (selectedElement.type === "shape" && renderShapeToolbar) {
              const shape = spread.shapes?.[selectedElement.index];
              if (!shape) return null;
              const context = buildShapeContext(
                shape,
                selectedElement.index,
                spread,
                selectedElement,
                handleElementSelect,
                handleSpreadItemAction
              );
              return renderShapeToolbar({
                ...context,
                selectedGeometry: state.selectedGeometry,
                canvasRef,
                onUpdateFill: (fill) =>
                  onSpreadItemAction?.({
                    itemType: "shape",
                    action: "update",
                    itemId: shape.id,
                    data: { fill: { ...shape.fill, ...fill } },
                  }),
                onUpdateOutline: (outline) =>
                  onSpreadItemAction?.({
                    itemType: "shape",
                    action: "update",
                    itemId: shape.id,
                    data: { outline: { ...shape.outline, ...outline } },
                  }),
              });
            }

            if (selectedElement.type === "video" && renderVideoToolbar) {
              const video = spread.videos?.[selectedElement.index];
              if (!video) return null;
              const context = buildVideoContext(
                video,
                selectedElement.index,
                spread,
                selectedElement,
                handleElementSelect,
                handleSpreadItemAction
              );
              return renderVideoToolbar({
                ...context,
                selectedGeometry: state.selectedGeometry,
                canvasRef,
                onReplaceVideo: () => {},
              });
            }

            if (selectedElement.type === "audio" && renderAudioToolbar) {
              const audio = spread.audios?.[selectedElement.index];
              if (!audio) return null;
              const context = buildAudioContext(
                audio,
                selectedElement.index,
                spread,
                selectedElement,
                handleElementSelect,
                handleSpreadItemAction
              );
              return renderAudioToolbar({
                ...context,
                selectedGeometry: state.selectedGeometry,
                canvasRef,
                onReplaceAudio: () => {},
              });
            }

            return null;
          })()}
      </div>
    </div>
  );
}

export default SpreadEditorPanel;
