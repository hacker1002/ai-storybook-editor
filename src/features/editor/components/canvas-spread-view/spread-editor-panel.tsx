// spread-editor-panel.tsx - Main editor canvas for selected spread
"use client";

import {
  useRef,
  useMemo,
  Fragment,
  type ReactNode,
} from "react";
import { useInteractionLayer } from "../../contexts";
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
import { getScaledDimensions } from "./utils/coordinate-utils";
import { LAYER_CONFIG } from "@/constants/spread-constants";
import { useCanvasWidth, useCanvasHeight } from "@/stores/editor-settings-store";
import type {
  BaseSpread,
  SpreadImage,
  SpreadVideo,
  SpreadAudio,
  SpreadQuiz,
  ItemType,
  SelectedElement,
  ResizeHandle,
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
import { useLanguageCode } from "@/stores/editor-settings-store";
import type { PageNumberingSettings } from "@/types/editor";
import { PageNumberingOverlay } from "./page-numbering-overlay";
import { useZoomCenterScroll } from "../../hooks/use-zoom-center-scroll";
import { useEditorSelection } from "./hooks/use-editor-selection";
import { useElementDragResize } from "./hooks/use-element-drag-resize";

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

  // Force a specific language code for textbox operations (overrides editor language).
  // Used by DummyMainView to lock all textbox reads/writes to the book's
  // original_language — dummies never follow the editor's current language.
  forceLanguageCode?: string;
}

// === Local State Interface ===
export interface EditorState {
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
  forceLanguageCode,
}: SpreadEditorPanelProps<TSpread>) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const currentEditorLangCode = useLanguageCode();
  // When forceLanguageCode is provided (e.g. by DummyMainView passing
  // book.original_language), it takes priority over the editor's current
  // language so textbox reads/writes always target the same language key.
  const editorLangCode = forceLanguageCode ?? currentEditorLangCode;
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();

  // === Zoom center preservation (delegated to hook) ===
  const containerRef = useZoomCenterScroll(zoomLevel, canvasRef);

  // === Selection state, handlers, geometry (delegated to hook) ===
  const {
    state,
    setState,
    handleElementSelect,
    handleCanvasClick,
    getSelectedGeometry,
  } = useEditorSelection({
    spread,
    canvasRef,
    externalSelectedItemId,
    onDeselect,
    editorLangCode,
  });

  // Scaled dimensions
  const { width: scaledWidth, height: scaledHeight } =
    getScaledDimensions(canvasWidth, canvasHeight, zoomLevel);

  // === Drag, resize, keyboard, and geometry update handlers (delegated to hook) ===
  const {
    handleDragStart,
    handleDrag,
    handleDragEnd,
    handleResizeStart,
    handleResize,
    handleResizeEnd,
    handleTextboxEditingChange,
    handleImageEditingChange,
    handleKeyDown,
    handleUpdatePage,
    handleSpreadItemAction,
    handleNudgeSelectedItem,
  } = useElementDragResize({
    spread,
    state,
    setState,
    getSelectedGeometry,
    handleElementSelect,
    onSpreadItemAction,
    isEditable,
    canDragItem,
    editorLangCode,
  });

  // === Interaction Layer Stack registration ===
  //
  // Only slot 'item' is registered here. Slot 'spread' is registered by the
  // parent CanvasSpreadView so that keyboard Delete can remove the selected
  // spread from BOTH edit mode and grid mode (this component doesn't mount
  // in grid mode).

  // Delete selected item (called by slot 'item'.onHotkey for Delete/Backspace)
  const handleDeleteSelectedItem = () => {
    const { selectedElement } = state;
    if (!selectedElement || selectedElement.type === 'page') return;

    let itemId: string | undefined;
    switch (selectedElement.type) {
      case 'image': itemId = (spread.images ?? [])[selectedElement.index]?.id; break;
      case 'raw_image': itemId = (spread.raw_images ?? [])[selectedElement.index]?.id; break;
      case 'textbox': itemId = (spread.textboxes ?? [])[selectedElement.index]?.id; break;
      case 'raw_textbox': itemId = (spread.raw_textboxes ?? [])[selectedElement.index]?.id; break;
      case 'shape': itemId = spread.shapes?.[selectedElement.index]?.id; break;
      case 'video': itemId = spread.videos?.[selectedElement.index]?.id; break;
      case 'audio': itemId = spread.audios?.[selectedElement.index]?.id; break;
      case 'quiz': itemId = spread.quizzes?.[selectedElement.index]?.id; break;
    }
    if (!itemId) return;

    const resolvedItemType: 'image' | 'textbox' | 'shape' | 'video' | 'audio' | 'quiz' =
      selectedElement.type === 'raw_image'
        ? 'image'
        : selectedElement.type === 'raw_textbox'
        ? 'textbox'
        : (selectedElement.type as 'image' | 'textbox' | 'shape' | 'video' | 'audio' | 'quiz');

    handleSpreadItemAction({
      itemType: resolvedItemType,
      action: 'delete',
      itemId,
      data: null,
    } as Omit<SpreadItemActionUnion, 'spreadId'>);
  };

  // Route hotkeys for slot 'item'
  const handleItemHotkey = (key: string) => {
    if (key === 'Escape') {
      handleElementSelect(null);
    } else if (key === 'Delete' || key === 'Backspace') {
      handleDeleteSelectedItem();
    } else if (key === 'ArrowUp') {
      handleNudgeSelectedItem('up');
    } else if (key === 'ArrowDown') {
      handleNudgeSelectedItem('down');
    } else if (key === 'ArrowLeft') {
      handleNudgeSelectedItem('left');
    } else if (key === 'ArrowRight') {
      handleNudgeSelectedItem('right');
    }
  };

  // Slot 'item' id: composed from type + resolved item id
  const itemSlotId = useMemo(() => {
    const { selectedElement } = state;
    if (!selectedElement) return null;
    let itemId: string | undefined;
    switch (selectedElement.type) {
      case 'image': itemId = (spread.images ?? [])[selectedElement.index]?.id; break;
      case 'raw_image': itemId = (spread.raw_images ?? [])[selectedElement.index]?.id; break;
      case 'textbox': itemId = (spread.textboxes ?? [])[selectedElement.index]?.id; break;
      case 'raw_textbox': itemId = (spread.raw_textboxes ?? [])[selectedElement.index]?.id; break;
      case 'shape': itemId = spread.shapes?.[selectedElement.index]?.id; break;
      case 'video': itemId = spread.videos?.[selectedElement.index]?.id; break;
      case 'audio': itemId = spread.audios?.[selectedElement.index]?.id; break;
      case 'quiz': itemId = spread.quizzes?.[selectedElement.index]?.id; break;
    }
    if (!itemId) return null;
    return `${selectedElement.type}:${itemId}`;
  }, [state.selectedElement, spread]);

  // Slot 'item' registration (active when an item is selected).
  //
  // NOT memoized by design: handlers (onHotkey → handleNudgeSelectedItem) close
  // over the latest `spread` prop, so we need a fresh object every render to
  // avoid stale geometry reads on repeated arrow-key nudges. The
  // useInteractionLayer proxy pattern already handles this efficiently —
  // layerRef.current is reassigned each render and the registration useEffect
  // only re-runs when `id` changes, so there is no spurious re-registration.
  const itemLayer: Parameters<typeof useInteractionLayer>[1] =
    state.selectedElement && itemSlotId
      ? {
          id: itemSlotId,
          ref: canvasRef,
          hotkeys: ['Delete', 'Backspace', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
          portalSelectors: [
            '[data-toolbar]',
            '[data-radix-popper-content-wrapper]',
            '[data-radix-select-content]',
            '[data-radix-popover-content]',
            '[role="listbox"]',
            '[role="dialog"]',
          ],
          dropdownSelectors: [
            '[data-radix-select-content]',
            '[data-radix-popover-content]',
            '[role="listbox"]',
          ],
          onHotkey: handleItemHotkey,
          onClickOutside: () => handleElementSelect(null),
          onForcePop: () => handleElementSelect(null),
        }
      : null;

  useInteractionLayer('item', itemLayer);

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
      ref={containerRef}
      className="flex-1 flex overflow-auto p-4 bg-muted/30"
      role="application"
      aria-label="Spread editor"
    >
      <div
        ref={canvasRef}
        className="relative shrink-0 m-auto bg-white shadow-lg"
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
            fontFamily={pageNumbering.font_family}
            fontSize={pageNumbering.font_size}
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
