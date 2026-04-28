// spread-editor-panel.tsx - Main editor canvas for selected spread
"use client";

import { useRef, useMemo, useState, useCallback, Fragment, type ReactNode } from "react";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "SpreadEditorPanel");
import { useInteractionLayer } from "../../contexts";
import { SelectionFrame } from "./selection-frame";
import { PageItem } from "./page-item";
import {
  buildImageContext,
  buildTextContext,
  buildTextToolbarContext,
  buildShapeContext,
  buildVideoContext,
  buildAutoPicContext,
  buildAudioContext,
  buildQuizContext,
} from "./utils/context-builders";
import { getScaledDimensions } from "./utils/coordinate-utils";
import { resolveItemZIndex } from "./utils/resolve-item-z-index";
import { Z_INDEX } from "@/constants/spread-constants";
import {
  useCanvasWidth,
  useCanvasHeight,
  useTrimPct,
} from "@/stores/editor-settings-store";
import { TrimGuideOverlay } from "./trim-guide-overlay";
import type {
  BaseSpread,
  ItemType,
  SelectedElement,
  ResizeHandle,
  Geometry,
  ImageItemContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AutoPicItemContext,
  AutoPicToolbarContext,
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
import { useBookTypography } from "@/stores/book-store";
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
  renderAutoPicItem?: (context: AutoPicItemContext<TSpread>) => ReactNode;
  renderAudioItem?: (context: AudioItemContext<TSpread>) => ReactNode;
  renderQuizItem?: (context: QuizItemContext<TSpread>) => ReactNode;

  // Toolbar render functions (optional)
  renderImageToolbar?: (context: ImageToolbarContext<TSpread>) => ReactNode;
  renderTextToolbar?: (context: TextToolbarContext<TSpread>) => ReactNode;
  renderPageToolbar?: (context: PageToolbarContext<TSpread>) => ReactNode;
  renderShapeToolbar?: (context: ShapeToolbarContext<TSpread>) => ReactNode;
  renderVideoToolbar?: (context: VideoToolbarContext<TSpread>) => ReactNode;
  renderAutoPicToolbar?: (context: AutoPicToolbarContext<TSpread>) => ReactNode;
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
  renderAutoPicItem,
  renderAudioItem,
  renderQuizItem,
  renderImageToolbar,
  renderTextToolbar,
  renderPageToolbar,
  renderShapeToolbar,
  renderVideoToolbar,
  renderAutoPicToolbar,
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
  const bookTypography = useBookTypography();
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();
  const trimPct = useTrimPct();

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
  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(
    canvasWidth,
    canvasHeight,
    zoomLevel
  );
  // ⚡ ADR-023: Staging zone ±50% of full bleed canvas.
  // Pad each side by half canvas dimension so user at max scroll still sees ≥50% spread.
  const stagingPadX = Math.round(scaledWidth / 2);
  const stagingPadY = Math.round(scaledHeight / 2);

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

  // === Textbox edit mode (controlled) ===
  // Single source of truth for which textbox is in controlled edit mode.
  // Toolbar Edit button and SelectionFrame double-click both set this.
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const handleBeginEdit = useCallback((id: string) => setEditingItemId(id), []);
  const handleEndEdit = useCallback(() => setEditingItemId(null), []);

  // === Interaction Layer Stack registration ===
  //
  // Only slot 'item' is registered here. Slot 'spread' is registered by the
  // parent CanvasSpreadView so that keyboard Delete can remove the selected
  // spread from BOTH edit mode and grid mode (this component doesn't mount
  // in grid mode).

  // Delete selected item (called by slot 'item'.onHotkey for Delete/Backspace)
  const handleDeleteSelectedItem = () => {
    const { selectedElement } = state;
    if (!selectedElement || selectedElement.type === "page") return;

    // Guard: raw items are read-only ONLY in spaces that opt-in via
    // preventEditRawItem (Objects/History retouch). In Illustration space
    // (preventEditRawItem=false, default) raw items are the editable layer,
    // so Delete must still route through.
    if (
      preventEditRawItem &&
      (selectedElement.type === "raw_image" ||
        selectedElement.type === "raw_textbox")
    ) {
      log.debug("handleDeleteSelectedItem", "skip.raw-item-read-only", {
        type: selectedElement.type,
      });
      return;
    }

    let itemId: string | undefined;
    switch (selectedElement.type) {
      case "image":
        itemId = (spread.images ?? [])[selectedElement.index]?.id;
        break;
      case "raw_image":
        itemId = (spread.raw_images ?? [])[selectedElement.index]?.id;
        break;
      case "textbox":
        itemId = (spread.textboxes ?? [])[selectedElement.index]?.id;
        break;
      case "raw_textbox":
        itemId = (spread.raw_textboxes ?? [])[selectedElement.index]?.id;
        break;
      case "shape":
        itemId = spread.shapes?.[selectedElement.index]?.id;
        break;
      case "video":
        itemId = spread.videos?.[selectedElement.index]?.id;
        break;
      case "auto_pic":
        itemId = spread.auto_pics?.[selectedElement.index]?.id;
        break;
      case "audio":
        itemId = spread.audios?.[selectedElement.index]?.id;
        break;
      case "quiz":
        itemId = spread.quizzes?.[selectedElement.index]?.id;
        break;
    }
    if (!itemId) return;

    const resolvedItemType:
      | "image"
      | "textbox"
      | "shape"
      | "video"
      | "auto_pic"
      | "audio"
      | "quiz" =
      selectedElement.type === "raw_image"
        ? "image"
        : selectedElement.type === "raw_textbox"
        ? "textbox"
        : (selectedElement.type as
            | "image"
            | "textbox"
            | "shape"
            | "video"
            | "auto_pic"
            | "audio"
            | "quiz");

    handleSpreadItemAction({
      itemType: resolvedItemType,
      action: "delete",
      itemId,
      data: null,
    } as Omit<SpreadItemActionUnion, "spreadId">);
  };

  // Route hotkeys for slot 'item'
  const handleItemHotkey = (key: string) => {
    if (key === "Escape") {
      handleElementSelect(null);
    } else if (key === "Delete" || key === "Backspace") {
      handleDeleteSelectedItem();
    } else if (
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "ArrowLeft" ||
      key === "ArrowRight"
    ) {
      // Guard: raw items cannot be nudged in spaces that opt-in via
      // preventEditRawItem (Objects/History retouch). In Illustration space
      // raw items are the editable layer and nudging is allowed.
      const { selectedElement } = state;
      if (
        preventEditRawItem &&
        (selectedElement?.type === "raw_image" ||
          selectedElement?.type === "raw_textbox")
      ) {
        log.debug("handleItemHotkey", "skip.raw-item-nudge-read-only", {
          type: selectedElement.type,
          key,
        });
        return;
      }
      if (key === "ArrowUp") handleNudgeSelectedItem("up");
      else if (key === "ArrowDown") handleNudgeSelectedItem("down");
      else if (key === "ArrowLeft") handleNudgeSelectedItem("left");
      else if (key === "ArrowRight") handleNudgeSelectedItem("right");
    }
  };

  // Slot 'item' id: composed from type + resolved item id
  const itemSlotId = useMemo(() => {
    const { selectedElement } = state;
    if (!selectedElement) return null;
    let itemId: string | undefined;
    switch (selectedElement.type) {
      case "image":
        itemId = (spread.images ?? [])[selectedElement.index]?.id;
        break;
      case "raw_image":
        itemId = (spread.raw_images ?? [])[selectedElement.index]?.id;
        break;
      case "textbox":
        itemId = (spread.textboxes ?? [])[selectedElement.index]?.id;
        break;
      case "raw_textbox":
        itemId = (spread.raw_textboxes ?? [])[selectedElement.index]?.id;
        break;
      case "shape":
        itemId = spread.shapes?.[selectedElement.index]?.id;
        break;
      case "video":
        itemId = spread.videos?.[selectedElement.index]?.id;
        break;
      case "auto_pic":
        itemId = spread.auto_pics?.[selectedElement.index]?.id;
        break;
      case "audio":
        itemId = spread.audios?.[selectedElement.index]?.id;
        break;
      case "quiz":
        itemId = spread.quizzes?.[selectedElement.index]?.id;
        break;
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
          hotkeys: [
            "Delete",
            "Backspace",
            "Escape",
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
          ],
          portalSelectors: [
            "[data-toolbar]",
            "[data-radix-popper-content-wrapper]",
            "[data-radix-select-content]",
            "[data-radix-popover-content]",
            // '[role="listbox"]',
            '[role="dialog"]',
          ],
          dropdownSelectors: [
            "[data-radix-select-content]",
            "[data-radix-popover-content]",
            "[data-radix-popper-content-wrapper]",
          ],
          onHotkey: handleItemHotkey,
          onClickOutside: () => handleElementSelect(null),
          onForcePop: () => handleElementSelect(null),
        }
      : null;

  useInteractionLayer("item", itemLayer);

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
  // Resolve the currently selected item's id so we can check if it's in edit mode.
  // Covers the four inline-editable types: textbox, raw_textbox, image, raw_image.
  // Other types (page/shape/video/audio/quiz) have no inline edit → null.
  const selectedItemId = (() => {
    const sel = state.selectedElement;
    if (!sel || sel.type === "page") return null;
    switch (sel.type) {
      case "textbox":
        return (spread.textboxes ?? [])[sel.index]?.id ?? null;
      case "raw_textbox":
        return (spread.raw_textboxes ?? [])[sel.index]?.id ?? null;
      case "image":
        return (spread.images ?? [])[sel.index]?.id ?? null;
      case "raw_image":
        return (spread.raw_images ?? [])[sel.index]?.id ?? null;
      default:
        return null;
    }
  })();

  // Unified edit-mode flag — single source of truth for disabling drag/resize
  // and making SelectionFrame pointer-events-transparent. Covers textbox AND
  // dummy art-note image editing.
  const isSelectedTextbox =
    state.selectedElement?.type === "textbox" ||
    state.selectedElement?.type === "raw_textbox";
  const isItemInEditMode =
    (selectedItemId !== null && editingItemId === selectedItemId) ||
    (isSelectedTextbox && state.isTextboxEditing);
  const canResizeCurrentItem = canResizeItem && !isIconElement && !rawBlocked && !isItemInEditMode;
  const canDragCurrentItem = canDragItem && !rawBlocked && !isItemInEditMode;
  const showHandles = canResizeCurrentItem && !state.isDragging;
  // Mirror selected item's stacking order on the selection frame so items
  // with a higher z-index than the selected element stay clickable. Items
  // below the selected one become unreachable — intentional, matches the
  // "active item is front-most" mental model.
  const calcSelectedZIndex =
    state.selectedElement && state.selectedElement.type !== "page"
      ? resolveItemZIndex(
          state.selectedElement.type,
          state.selectedElement.index,
          spread,
          isRawElement && !preventEditRawItem
        )
      : 0;

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0 min-h-0 flex overflow-auto bg-muted/30"
      role="application"
      aria-label="Spread editor"
    >
      {/* Scroll-content wrapper: padding here (not on containerRef) so containerRef
          can shrink to parent width. m-auto centers canvas when viewport exceeds content. */}
      <div
        className="flex shrink-0 m-auto"
        style={{ padding: `${stagingPadY}px ${stagingPadX}px` }}
      >
      <div
        ref={canvasRef}
        className="relative shrink-0 bg-white shadow-lg"
        style={{
          width: scaledWidth,
          height: scaledHeight,
          willChange: "transform",
          overflow: "visible",
        }}
        onClick={handleCanvasClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* Layer A: Backgrounds — clipped to trim box, pointer-events:none so clicks pass through to
            negative-z-index items in Layer B. PageItem children override with pointer-events:auto. */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
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
          style={{
            left: "50%",
            background: "rgba(0, 0, 0, 0.12)",
            zIndex: Z_INDEX.PAGE_BACKGROUND,
          }}
        />

        {/* Page Number Overlay */}
        {pageNumbering && pageNumbering.position !== "none" && (
          <PageNumberingOverlay
            pages={spread.pages}
            position={pageNumbering.position}
            color={pageNumbering.color}
            fontFamily={pageNumbering.font_family}
            fontSize={pageNumbering.font_size}
          />
        )}

        </div>
        {/* Items render directly in canvasDiv (which has overflow:visible + will-change:transform
            creating a stacking context). A wrapper here would intercept clicks for items with
            negative z-index, since such items paint below a no-z-index absolute wrapper even when
            they are its DOM descendants. */}
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
              (isEditing) => {
                handleImageEditingChange(isEditing);
                if (!isEditing && editingItemId === image.id) handleEndEdit();
              },
              "raw_image"
            );
            // if can edit raw item (illustration step) => treat as image item
            context.zIndex = resolveItemZIndex(
              "raw_image",
              index,
              spread,
              !preventEditRawItem
            );
            context.isEditing = editingItemId === image.id;
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
              (isEditing) => {
                handleImageEditingChange(isEditing);
                if (!isEditing && editingItemId === image.id) handleEndEdit();
              }
            );
            context.zIndex = resolveItemZIndex("image", index, spread);
            context.isEditing = editingItemId === image.id;
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
            context.zIndex = resolveItemZIndex("video", index, spread);
            return (
              <Fragment key={video.id ?? `vid-${index}`}>
                {renderVideoItem(context)}
              </Fragment>
            );
          })}

        {/* Animated Pics */}
        {renderItems.includes("auto_pic") &&
          renderAutoPicItem &&
          spread.auto_pics?.map((autoPic, index) => {
            const context = buildAutoPicContext(
              autoPic,
              index,
              spread,
              state.selectedElement,
              handleElementSelect,
              handleSpreadItemAction
            );
            context.zIndex = resolveItemZIndex("auto_pic", index, spread);
            return (
              <Fragment key={autoPic.id ?? `anim-${index}`}>
                {renderAutoPicItem(context)}
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
            context.zIndex = resolveItemZIndex("shape", index, spread);
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
              (isEditing) => {
                handleTextboxEditingChange(isEditing);
                if (!isEditing && editingItemId === textbox.id) handleEndEdit();
              },
              editorLangCode,
              "raw_textbox",
              bookTypography
            );
            // if can edit raw item (illustration step) => treat as textbox item
            context.zIndex = resolveItemZIndex(
              "raw_textbox",
              index,
              spread,
              !preventEditRawItem
            );
            context.isEditing = editingItemId === textbox.id;
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
              (isEditing) => {
                handleTextboxEditingChange(isEditing);
                if (!isEditing && editingItemId === textbox.id) handleEndEdit();
              },
              editorLangCode,
              "textbox",
              bookTypography
            );
            context.zIndex = resolveItemZIndex("textbox", index, spread);
            context.isEditing = editingItemId === textbox.id;
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
            context.zIndex = resolveItemZIndex("audio", index, spread);
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
            context.zIndex = resolveItemZIndex("quiz", index, spread);
            return (
              <Fragment key={quiz.id ?? `quiz-${index}`}>
                {renderQuizItem(context)}
              </Fragment>
            );
          })}

        {/* ⚡ ADR-023: Advisory trim guide — dashed rect at [trimPct, 100-trimPct] inside canvas */}
        <TrimGuideOverlay trimPct={trimPct} />
        {/* Selection Frame - frame border allows drag, center passes through for editing */}
        {state.selectedElement &&
          selectedGeometry &&
          isEditable &&
          state.selectedElement.type !== "page" && (
            <SelectionFrame
              geometry={selectedGeometry}
              zIndex={calcSelectedZIndex}
              zoomLevel={zoomLevel}
              showHandles={showHandles}
              activeHandle={state.activeHandle}
              canDrag={canDragCurrentItem}
              canResize={canResizeCurrentItem}
              onDoubleClick={() => {
                const { selectedElement } = state;
                if (!selectedElement) return;
                if (selectedElement.type === "textbox") {
                  const id = (spread.textboxes ?? [])[selectedElement.index]?.id;
                  if (id) handleBeginEdit(id);
                } else if (selectedElement.type === "raw_textbox") {
                  const id = (spread.raw_textboxes ?? [])[selectedElement.index]?.id;
                  if (id) handleBeginEdit(id);
                }
              }}
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
                onEditArtNote: () => handleBeginEdit(rawImg.id),
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
                onEditArtNote: () => handleBeginEdit(image.id),
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
                "raw_textbox",
                bookTypography
              );
              return renderRawTextboxToolbar({
                ...context,
                onEditText: () => handleBeginEdit(rawTb.id),
              });
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
                editorLangCode,
                "textbox",
                bookTypography
              );
              return renderTextToolbar({
                ...context,
                onEditText: () => handleBeginEdit(textbox.id),
              });
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

            if (selectedElement.type === "auto_pic" && renderAutoPicToolbar) {
              const autoPic = spread.auto_pics?.[selectedElement.index];
              if (!autoPic) return null;
              const context = buildAutoPicContext(
                autoPic,
                selectedElement.index,
                spread,
                selectedElement,
                handleElementSelect,
                handleSpreadItemAction
              );
              return renderAutoPicToolbar({
                ...context,
                selectedGeometry: state.selectedGeometry,
                canvasRef,
                onReplaceAutoPic: () => {},
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
    </div>
  );
}

export default SpreadEditorPanel;
