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
import { useCanvasWidth, useCanvasHeight } from "@/stores/editor-settings-store";
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
import { createLogger } from "@/utils/logger";
import type { PageNumberingSettings } from "@/types/editor";
import { PageNumberingOverlay } from "./page-numbering-overlay";

const log = createLogger("Editor", "SpreadEditorPanel");

// Fixed pixel size of audio/quiz icon elements (w-8 h-8 = 32px)
const ICON_ELEMENT_PX = 32;

// === Layer helpers ===
// Images and textboxes exist in two layers:
//   raw_images/raw_textboxes  — illustration phase (editor-only art)
//   images/textboxes          — playable phase (interactive objects)
// Each layer has its own SelectedElementType: "raw_image"/"raw_textbox" vs "image"/"textbox"

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

  // Raw item render functions (illustration layer)
  renderRawImage?: (context: ImageItemContext<TSpread>) => ReactNode;
  renderRawTextbox?: (context: TextItemContext<TSpread>) => ReactNode;
  renderRawImageToolbar?: (context: ImageToolbarContext<TSpread>) => ReactNode;
  renderRawTextboxToolbar?: (context: TextToolbarContext<TSpread>) => ReactNode;

  // Callbacks
  onSpreadItemAction?: (
    params: Omit<SpreadItemActionUnion, "spreadId">
  ) => void;

  // Item-level feature flags
  canResizeItem?: boolean;
  canDragItem?: boolean;
  preventEditRawItem?: boolean; // When true, raw items (raw_image/raw_textbox) cannot drag/resize

  // Layout config
  availableLayouts?: LayoutOption[];

  // External selection sync (sidebar → canvas)
  externalSelectedItemId?: { type: string; id: string } | null;

  // Callback when a page background is selected in canvas (canvas → sidebar sync)
  onPageSelect?: (pageIndex: number) => void;

  // Callback when selection is cleared (click outside canvas)
  onDeselect?: () => void;

  // Page numbering overlay settings (null/undefined = hidden)
  pageNumbering?: PageNumberingSettings | null;
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
  renderRawImage,
  renderRawTextbox,
  renderRawImageToolbar,
  renderRawTextboxToolbar,
  onSpreadItemAction,
  canResizeItem = true,
  canDragItem = true,
  preventEditRawItem = false,
  availableLayouts = [],
  externalSelectedItemId,
  onPageSelect,
  onDeselect,
  pageNumbering,
}: SpreadEditorPanelProps<TSpread>) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const onDeselectRef = useRef(onDeselect);
  onDeselectRef.current = onDeselect;
  const editorLangCode = useLanguageCode();
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();
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

    if (type === "raw_image") {
      resolvedType = "raw_image";
      index = (spread.raw_images ?? []).findIndex((img) => img.id === id);
    } else if (type === "image") {
      resolvedType = "image";
      index = (spread.images ?? []).findIndex((img) => img.id === id);
    } else if (type === "raw_textbox") {
      resolvedType = "raw_textbox";
      index = (spread.raw_textboxes ?? []).findIndex((tb) => tb.id === id);
    } else if (type === "textbox") {
      resolvedType = "textbox";
      index = (spread.textboxes ?? []).findIndex((tb) => tb.id === id);
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
    } else if (type === "page") {
      // Page IDs are "page-0", "page-1" etc. — extract index
      const pageIndex = parseInt(id.replace("page-", ""), 10);
      if (!isNaN(pageIndex) && pageIndex >= 0 && pageIndex < spread.pages.length) {
        resolvedType = "page";
        index = pageIndex;
      }
    }

    if (resolvedType && index >= 0) {
      const element: SelectedElement = { type: resolvedType, index };
      setState((prev) => {
        if (
          prev.selectedElement?.type === element.type &&
          prev.selectedElement?.index === element.index
        ) {
          return prev; // No change, skip re-render
        }
        // Resolve geometry for the selection frame
        let geometry: Geometry | null = null;
        if (element.type === "raw_image")
          geometry = (spread.raw_images ?? [])[element.index]?.geometry ?? null;
        else if (element.type === "image")
          geometry = (spread.images ?? [])[element.index]?.geometry ?? null;
        else if (element.type === "raw_textbox") {
          const tb = (spread.raw_textboxes ?? [])[element.index];
          const tbResult = getTextboxContentForLanguage(
            tb || {},
            editorLangCode
          );
          geometry = tbResult?.content?.geometry ?? null;
        } else if (element.type === "textbox") {
          const tb = (spread.textboxes ?? [])[element.index];
          const tbResult = getTextboxContentForLanguage(
            tb || {},
            editorLangCode
          );
          geometry = tbResult?.content?.geometry ?? null;
        } else if (element.type === "shape")
          geometry = spread.shapes?.[element.index]?.geometry ?? null;
        else if (element.type === "video")
          geometry = spread.videos?.[element.index]?.geometry ?? null;
        else if (element.type === "audio") {
          const audioGeo = spread.audios?.[element.index]?.geometry;
          geometry = audioGeo ? computeIconGeometry(audioGeo) : null;
        } else if (element.type === "quiz") {
          const quizGeo = spread.quizzes?.[element.index]?.geometry;
          geometry = quizGeo ? computeIconGeometry(quizGeo) : null;
        }

        return {
          ...prev,
          selectedElement: element,
          selectedGeometry: geometry,
          isDragging: false,
          isResizing: false,
          activeHandle: null,
          originalGeometry: null,
        };
      });
    }
    // Only re-run when the external selection identity changes, not on spread data updates.
    // `spread` is read inside but must not trigger re-selection on every store mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSelectedItemId?.type, externalSelectedItemId?.id]);

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
      onDeselectRef.current?.();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [state.selectedElement]);

  // Scaled dimensions
  const { width: scaledWidth, height: scaledHeight } =
    getScaledDimensions(canvasWidth, canvasHeight, zoomLevel);

  // === Selection Handlers ===
  const handleElementSelect = useCallback(
    (element: SelectedElement | null) => {
      log.info("handleElementSelect", "element selected", {
        type: element?.type ?? null,
        index: element?.index ?? null,
      });
      let geometry: Geometry | null = null;

      if (element) {
        if (element.type === "raw_image") {
          geometry = (spread.raw_images ?? [])[element.index]?.geometry ?? null;
        } else if (element.type === "image") {
          geometry = (spread.images ?? [])[element.index]?.geometry ?? null;
        } else if (element.type === "raw_textbox") {
          const item = (spread.raw_textboxes ?? [])[element.index];
          const tbResult = getTextboxContentForLanguage(
            item || {},
            editorLangCode
          );
          geometry = tbResult?.content?.geometry ?? null;
        } else if (element.type === "textbox") {
          const item = (spread.textboxes ?? [])[element.index];
          const tbResult = getTextboxContentForLanguage(
            item || {},
            editorLangCode
          );
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
      case "raw_image":
        return (
          (spread.raw_images ?? [])[selectedElement.index]?.geometry ?? null
        );
      case "image":
        return (spread.images ?? [])[selectedElement.index]?.geometry ?? null;
      case "raw_textbox": {
        const rawTb = (spread.raw_textboxes ?? [])[selectedElement.index];
        if (!rawTb) return null;
        const rawTbResult = getTextboxContentForLanguage(rawTb, editorLangCode);
        return rawTbResult?.content?.geometry ?? null;
      }
      case "textbox": {
        const tb = (spread.textboxes ?? [])[selectedElement.index];
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
        case "raw_image": {
          const rawImg = (spread.raw_images ?? [])[element.index];
          if (!rawImg?.id) return;
          onSpreadItemAction({
            itemType: "image",
            action: "update",
            itemId: rawImg.id,
            data: { geometry },
          });
          break;
        }
        case "image": {
          const image = (spread.images ?? [])[element.index];
          if (!image?.id) return;
          onSpreadItemAction({
            itemType: "image",
            action: "update",
            itemId: image.id,
            data: { geometry },
          });
          break;
        }
        case "raw_textbox": {
          const rawTb = (spread.raw_textboxes ?? [])[element.index];
          if (!rawTb?.id) return;
          const rawTbResult = getTextboxContentForLanguage(
            rawTb,
            editorLangCode
          );
          if (rawTbResult) {
            onSpreadItemAction({
              itemType: "textbox",
              action: "update",
              itemId: rawTb.id,
              data: {
                [rawTbResult.langKey]: { ...rawTbResult.content, geometry },
              } as Partial<SpreadTextbox>,
            });
          }
          break;
        }
        case "textbox": {
          const tb = (spread.textboxes ?? [])[element.index];
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
    log.debug("handleDragStart", "drag started");
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
      if (
        selectedElement.type === "raw_image" ||
        selectedElement.type === "image" ||
        selectedElement.type === "video"
      ) {
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
      }
    },
    [
      state,
      isEditable,
      getSelectedGeometry,
      updateElementGeometry,
      handleElementSelect,
      canDragItem,
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
      // Clear selection before delete to prevent stale index crash on re-render
      if (params.action === "delete") {
        handleElementSelect(null);
      }
      onSpreadItemAction?.(params);
    },
    [onSpreadItemAction, handleElementSelect]
  );

  // === Render ===
  const selectedGeometry = getSelectedGeometry();
  // Audio/Quiz are fixed-size icons — disable resize, only allow drag
  const isIconElement =
    state.selectedElement?.type === "audio" ||
    state.selectedElement?.type === "quiz";
  // Raw items (raw_image/raw_textbox) cannot drag/resize when preventEditRawItem is enabled
  const isRawElement =
    state.selectedElement?.type === "raw_image" ||
    state.selectedElement?.type === "raw_textbox";
  const rawBlocked = isRawElement && preventEditRawItem;
  const canResizeCurrentItem = canResizeItem && !isIconElement && !rawBlocked;
  const canDragCurrentItem = canDragItem && !rawBlocked;
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
                ? () => {
                    handleElementSelect({ type: "page", index: pageIndex });
                    onPageSelect?.(pageIndex);
                  }
                : undefined
            }
            onUpdatePage={(updates) => handleUpdatePage(pageIndex, updates)}
            renderPageToolbar={renderPageToolbar}
            availableLayouts={availableLayouts}
          />
        ))}

        {/* Page Center Divider — always visible */}
        <div
          className="absolute top-0 bottom-0 w-px pointer-events-none"
          style={{ left: '50%', background: 'rgba(0, 0, 0, 0.12)', zIndex: -999 }}
        />

        {/* Page Number Overlay */}
        {pageNumbering && pageNumbering.position !== 'none' && (
          <PageNumberingOverlay
            pages={spread.pages}
            position={pageNumbering.position}
            color={pageNumbering.color}
          />
        )}

        {/* Raw Images (illustration layer) */}
        {renderItems.includes("raw_image") &&
          renderRawImage &&
          (spread.raw_images ?? []).map((image, index) => {
            const context = buildImageContext(
              image,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction,
              handleImageEditingChange,
              "raw_image"
            );
            // Raw images render below all editable layers (negative z-index)
            context.zIndex = -(spread.raw_images?.length ?? 0) + index;
            return (
              <Fragment key={image.id ?? `raw-img-${index}`}>
                {renderRawImage(context)}
              </Fragment>
            );
          })}

        {/* Images (playable layer) */}
        {renderItems.includes("image") &&
          renderImageItem &&
          (spread.images ?? []).map((image, index) => {
            const context = buildImageContext(
              image,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction,
              handleImageEditingChange
            );
            context.zIndex =
              (image as SpreadImage)["z-index"] ??
              LAYER_CONFIG.MEDIA.min + index;
            return (
              <Fragment key={image.id ?? `img-${index}`}>
                {renderImageItem(context)}
              </Fragment>
            );
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
            const totalImageCount = Math.max(
              spread.raw_images?.length ?? 0,
              spread.images?.length ?? 0
            );
            context.zIndex =
              (video as SpreadVideo)["z-index"] ??
              LAYER_CONFIG.MEDIA.min + totalImageCount + index;
            return (
              <Fragment key={video.id ?? `vid-${index}`}>
                {renderVideoItem(context)}
              </Fragment>
            );
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
            context.zIndex =
              (shape as { "z-index"?: number })["z-index"] ??
              LAYER_CONFIG.OBJECTS.min + index;
            return (
              <Fragment key={shape.id ?? `shp-${index}`}>
                {renderShapeItem(context)}
              </Fragment>
            );
          })}

        {/* Raw Textboxes (illustration layer) */}
        {renderItems.includes("raw_textbox") &&
          renderRawTextbox &&
          (spread.raw_textboxes ?? []).map((textbox, index) => {
            const context = buildTextContext(
              textbox,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction,
              handleTextboxEditingChange,
              editorLangCode,
              "raw_textbox"
            );
            // Raw textboxes render just above raw images but below all editable layers
            const rawImgCount = spread.raw_images?.length ?? 0;
            context.zIndex = -(rawImgCount) + (spread.raw_textboxes?.length ?? 0) + index;
            return (
              <Fragment key={textbox.id ?? `raw-txt-${index}`}>
                {renderRawTextbox(context)}
              </Fragment>
            );
          })}

        {/* Textboxes (playable layer) */}
        {renderItems.includes("textbox") &&
          renderTextItem &&
          (spread.textboxes ?? []).map((textbox, index) => {
            const context = buildTextContext(
              textbox,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction,
              handleTextboxEditingChange,
              editorLangCode
            );
            context.zIndex =
              (textbox as { "z-index"?: number })["z-index"] ??
              LAYER_CONFIG.TEXT.min + index;
            return (
              <Fragment key={textbox.id ?? `txt-${index}`}>
                {renderTextItem(context)}
              </Fragment>
            );
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
            context.zIndex =
              (audio as SpreadAudio)["z-index"] ??
              LAYER_CONFIG.OBJECTS.min + shapesCount + index;
            return (
              <Fragment key={audio.id ?? `aud-${index}`}>
                {renderAudioItem(context)}
              </Fragment>
            );
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
            context.zIndex =
              (quiz as SpreadQuiz)["z-index"] ??
              LAYER_CONFIG.OBJECTS.min + shapesCount + audiosCount + index;
            return (
              <Fragment key={quiz.id ?? `quiz-${index}`}>
                {renderQuizItem(context)}
              </Fragment>
            );
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
              canDrag={canDragCurrentItem}
              canResize={canResizeCurrentItem}
              borderOnlyDrag={
                state.selectedElement?.type === "textbox" ||
                state.selectedElement?.type === "raw_textbox"
              }
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

            if (selectedElement.type === "raw_image" && renderRawImageToolbar) {
              const rawImg = (spread.raw_images ?? [])[selectedElement.index];
              if (!rawImg) return null;
              const context = buildImageContext(
                rawImg,
                selectedElement.index,
                spread,
                selectedElement,
                handleElementSelect,
                handleSpreadItemAction,
                undefined,
                "raw_image"
              );
              return renderRawImageToolbar({
                ...context,
                selectedGeometry: state.selectedGeometry,
                canvasRef,
                onGenerateImage: () => {},
                onReplaceImage: () => {},
              });
            }

            if (selectedElement.type === "image" && renderImageToolbar) {
              const image = (spread.images ?? [])[selectedElement.index];
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

            if (
              selectedElement.type === "raw_textbox" &&
              renderRawTextboxToolbar
            ) {
              const rawTb = (spread.raw_textboxes ?? [])[selectedElement.index];
              if (!rawTb) return null;
              const context = buildTextToolbarContext(
                rawTb,
                selectedElement.index,
                spread,
                selectedElement,
                handleElementSelect,
                handleSpreadItemAction,
                canvasRef,
                state.selectedGeometry,
                undefined,
                editorLangCode,
                "raw_textbox"
              );
              return renderRawTextboxToolbar(context);
            }

            if (selectedElement.type === "textbox" && renderTextToolbar) {
              const textbox = (spread.textboxes ?? [])[selectedElement.index];
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
                onCropAudio: undefined,
              });
            }

            return null;
          })()}
      </div>
    </div>
  );
}

export default SpreadEditorPanel;
