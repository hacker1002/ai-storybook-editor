// spread-editor-panel.tsx - Main editor canvas for selected spread
"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
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
} from "./utils/context-builders";
import {
  applyDragDelta,
  applyResizeDelta,
  applyNudge,
} from "./utils/geometry-utils";
import { getScaledDimensions } from "./utils/coordinate-utils";
import { CANVAS, Z_INDEX } from "./constants";
import type {
  BaseSpread,
  SpreadTextbox,
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
  ImageToolbarContext,
  TextToolbarContext,
  PageToolbarContext,
  ShapeToolbarContext,
  VideoToolbarContext,
  AudioToolbarContext,
  LayoutOption,
  Typography,
  SpreadItemActionUnion,
} from "./types";
import { getFirstTextboxKey } from "../shared";

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
}: SpreadEditorPanelProps<TSpread>) {
  const canvasRef = useRef<HTMLDivElement>(null);

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
      let geometry: Geometry | null = null;

      if (element) {
        if (element.type === "image") {
          geometry = spread.images[element.index]?.geometry ?? null;
        } else if (element.type === "textbox") {
          const item = spread.textboxes[element.index];
          const langKey = getFirstTextboxKey(item || {});
          geometry = langKey
            ? (item[langKey] as { geometry: Geometry })?.geometry ?? null
            : null;
        } else if (element.type === "shape") {
          geometry = spread.shapes?.[element.index]?.geometry ?? null;
        } else if (element.type === "video") {
          geometry = spread.videos?.[element.index]?.geometry ?? null;
        } else if (element.type === "audio") {
          geometry = spread.audios?.[element.index]?.geometry ?? null;
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
    [spread]
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
        return spread.images[selectedElement.index]?.geometry ?? null;
      case "textbox": {
        const tb = spread.textboxes[selectedElement.index];
        if (!tb) return null;
        const langKey = getFirstTextboxKey(tb);
        return langKey
          ? (tb[langKey] as { geometry: Geometry })?.geometry ?? null
          : null;
      }
      case "shape":
        return spread.shapes?.[selectedElement.index]?.geometry ?? null;
      case "video":
        return spread.videos?.[selectedElement.index]?.geometry ?? null;
      case "audio":
        return spread.audios?.[selectedElement.index]?.geometry ?? null;
      default:
        return null;
    }
  }, [state, spread]);

  // === Geometry Update ===
  const updateElementGeometry = useCallback(
    (element: SelectedElement, geometry: Geometry) => {
      if (!onSpreadItemAction) return;

      switch (element.type) {
        case "image": {
          const image = spread.images[element.index];
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
          const tb = spread.textboxes[element.index];
          if (!tb?.id) return;
          const langKey = getFirstTextboxKey(tb);
          if (langKey) {
            const langContent = tb[langKey] as {
              text: string;
              geometry: Geometry;
              typography: Typography;
            };
            onSpreadItemAction({
              itemType: "text",
              action: "update",
              itemId: tb.id,
              data: {
                [langKey]: { ...langContent, geometry },
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
      }
    },
    [
      spread.images,
      spread.textboxes,
      spread.shapes,
      spread.videos,
      spread.audios,
      onSpreadItemAction,
    ]
  );

  // === Drag Handlers ===
  const handleDragStart = useCallback(() => {
    const geometry = getSelectedGeometry();
    setState((prev) => ({
      ...prev,
      isDragging: true,
      originalGeometry: geometry,
    }));
  }, [getSelectedGeometry]);

  const handleDrag = useCallback(
    (delta: Point) => {
      const { selectedElement, originalGeometry } = state;
      if (!selectedElement || !originalGeometry) return;

      const newGeometry = applyDragDelta(originalGeometry, delta.x, delta.y);
      updateElementGeometry(selectedElement, newGeometry);

      // Update selectedGeometry for toolbar positioning
      setState((prev) => ({ ...prev, selectedGeometry: newGeometry }));
    },
    [state, updateElementGeometry]
  );

  const handleDragEnd = useCallback(() => {
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
      const { selectedElement, originalGeometry } = state;
      if (!selectedElement || !originalGeometry) return;

      const newGeometry = applyResizeDelta(
        originalGeometry,
        handle,
        delta.x,
        delta.y
      );

      // Helper: apply aspect ratio lock to geometry
      const applyAspectLock = (geo: Geometry, aspect: number) => {
        if (handle === "e" || handle === "w") {
          geo.h = geo.w / aspect;
        } else if (handle === "n" || handle === "s") {
          geo.w = geo.h * aspect;
        } else {
          if (Math.abs(delta.x) > Math.abs(delta.y)) {
            geo.h = geo.w / aspect;
          } else {
            geo.w = geo.h * aspect;
          }
        }

        const minSize = CANVAS.MIN_ELEMENT_SIZE;
        if (geo.w < minSize) {
          geo.w = minSize;
          geo.h = minSize / aspect;
        }
        if (geo.h < minSize) {
          geo.h = minSize;
          geo.w = minSize * aspect;
        }

        geo.w = Math.min(geo.w, 100 - geo.x);
        geo.h = Math.min(geo.h, 100 - geo.y);
      };

      // Aspect ratio lock for Image items (always locked to original ratio)
      if (selectedElement.type === "image") {
        const originalAspect = originalGeometry.w / originalGeometry.h;
        applyAspectLock(newGeometry, originalAspect);
      }

      // Aspect ratio lock for Video items (when aspect_ratio is set)
      if (selectedElement.type === "video") {
        const originalAspect = originalGeometry.w / originalGeometry.h;
        applyAspectLock(newGeometry, originalAspect);
      }

      updateElementGeometry(selectedElement, newGeometry);

      // Update selectedGeometry for toolbar positioning
      setState((prev) => ({ ...prev, selectedGeometry: newGeometry }));
    },
    [state, updateElementGeometry]
  );

  const handleResizeEnd = useCallback(() => {
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
      const { selectedElement, isDragging, isResizing, originalGeometry } =
        state;
      if (!selectedElement || !isEditable) return;

      // Handle ESC first - works for all selection types including page
      if (e.key === "Escape") {
        e.preventDefault();
        if ((isDragging || isResizing) && originalGeometry) {
          updateElementGeometry(selectedElement, originalGeometry);
          setState((prev) => ({
            ...prev,
            isDragging: false,
            isResizing: false,
            activeHandle: null,
            originalGeometry: null,
            selectedGeometry: originalGeometry,
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
              const image = spread.images[selectedElement.index];
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
              const textbox = spread.textboxes[selectedElement.index];
              if (textbox?.id) {
                onSpreadItemAction({
                  itemType: "text",
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
      spread.images,
      spread.textboxes,
      spread.shapes,
      spread.videos,
      spread.audios,
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
  const showHandles = canResizeItem && !state.isDragging;

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
            style={{ left: "50%", zIndex: Z_INDEX.IMAGE_BASE - 1 }}
          />
        )}

        {/* Images - skip if renderImageItem not provided */}
        {renderItems.includes("image") &&
          renderImageItem &&
          spread.images.map((image, index) => {
            const context = buildImageContext(
              image,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction,
              handleImageEditingChange
            );
            return (
              <div key={image.id || index}>{renderImageItem(context)}</div>
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
            return (
              <div key={video.id || index}>{renderVideoItem(context)}</div>
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
            return (
              <div key={shape.id || index}>{renderShapeItem(context)}</div>
            );
          })}

        {/* Textboxes - skip if renderTextItem not provided */}
        {renderItems.includes("text") &&
          renderTextItem &&
          spread.textboxes.map((textbox, index) => {
            const context = buildTextContext(
              textbox,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction,
              handleTextboxEditingChange
            );
            return (
              <div key={textbox.id || index}>{renderTextItem(context)}</div>
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
            return (
              <div key={audio.id || index}>{renderAudioItem(context)}</div>
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
              canDrag={canDragItem}
              canResize={canResizeItem}
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
              const image = spread.images[selectedElement.index];
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
              const textbox = spread.textboxes[selectedElement.index];
              if (!textbox) return null;

              const context = buildTextToolbarContext(
                textbox,
                selectedElement.index,
                spread,
                selectedElement,
                handleElementSelect,
                handleSpreadItemAction,
                canvasRef,
                state.selectedGeometry
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
