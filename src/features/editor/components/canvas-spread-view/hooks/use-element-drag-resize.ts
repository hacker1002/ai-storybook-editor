// use-element-drag-resize.ts — Handles geometry updates, drag, resize, keyboard
// nudge, editing state changes, and page update actions for canvas elements.

import { useRef, useCallback } from "react";
import {
  applyDragDelta,
  applyResizeDelta,
  applyAspectLockedResize,
  applyNudge,
} from "../utils/geometry-utils";
import { CANVAS } from "@/constants/spread-constants";
import { getTextboxContentForLanguage } from "../../../utils/textbox-helpers";
import { createLogger } from "@/utils/logger";
import type {
  BaseSpread,
  SpreadTextbox,
  SelectedElement,
  ResizeHandle,
  Point,
  Geometry,
  SpreadItemActionUnion,
} from "@/types/canvas-types";
import type { EditorState } from "../spread-editor-panel";

const log = createLogger("Editor", "useElementDragResize");

// === Params ===

interface UseElementDragResizeParams<TSpread extends BaseSpread> {
  spread: TSpread;
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
  getSelectedGeometry: () => Geometry | null;
  handleElementSelect: (element: SelectedElement | null) => void;
  onSpreadItemAction?: (params: Omit<SpreadItemActionUnion, "spreadId">) => void;
  isEditable: boolean;
  canDragItem: boolean;
  editorLangCode: string;
}

// === Return type ===

interface UseElementDragResizeReturn {
  handleDragStart: () => void;
  handleDrag: (delta: Point) => void;
  handleDragEnd: () => void;
  handleResizeStart: (handle: ResizeHandle) => void;
  handleResize: (handle: ResizeHandle, delta: Point) => void;
  handleResizeEnd: () => void;
  handleTextboxEditingChange: (isEditing: boolean) => void;
  handleImageEditingChange: (isEditing: boolean) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleUpdatePage: (pageIndex: number, updates: Record<string, unknown>) => void;
  handleSpreadItemAction: (params: Omit<SpreadItemActionUnion, "spreadId">) => void;
  handleNudgeSelectedItem: (direction: 'up' | 'down' | 'left' | 'right') => void;
}

// === Hook ===

export function useElementDragResize<TSpread extends BaseSpread>({
  spread,
  state,
  setState,
  getSelectedGeometry,
  handleElementSelect,
  onSpreadItemAction,
  isEditable,
  canDragItem,
  editorLangCode,
}: UseElementDragResizeParams<TSpread>): UseElementDragResizeReturn {
  // Ref for originalGeometry to avoid stale closures in drag/resize handlers.
  // React batches setState from handleResizeStart, so handleResize may still
  // capture old state where originalGeometry is null. The ref is mutated
  // synchronously and always reflects the latest value.
  const originalGeometryRef = useRef<Geometry | null>(null);

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
          const rawTbResult = getTextboxContentForLanguage(rawTb, editorLangCode);
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
        case "auto_pic": {
          const autoPic = spread.auto_pics?.[element.index];
          if (!autoPic?.id) return;
          onSpreadItemAction({
            itemType: "auto_pic",
            action: "update",
            itemId: autoPic.id,
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
      spread.auto_pics,
      spread.audios,
      spread.quizzes,
      onSpreadItemAction,
      editorLangCode,
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
  }, [getSelectedGeometry, setState]);

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
    [state, updateElementGeometry, setState]
  );

  const handleDragEnd = useCallback(() => {
    originalGeometryRef.current = null;
    setState((prev) => ({
      ...prev,
      isDragging: false,
      originalGeometry: null,
    }));
  }, [setState]);

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
    [getSelectedGeometry, setState]
  );

  const handleResize = useCallback(
    (handle: ResizeHandle, delta: Point) => {
      const { selectedElement } = state;
      const originalGeometry = originalGeometryRef.current;
      if (!selectedElement || !originalGeometry) return;

      let newGeometry: Geometry;

      // Image/Video/AutoPic: aspect-ratio-locked resize with proper anchor handling
      if (
        selectedElement.type === "raw_image" ||
        selectedElement.type === "image" ||
        selectedElement.type === "video" ||
        selectedElement.type === "auto_pic"
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
    [state, updateElementGeometry, setState]
  );

  const handleResizeEnd = useCallback(() => {
    originalGeometryRef.current = null;
    setState((prev) => ({
      ...prev,
      isResizing: false,
      activeHandle: null,
      originalGeometry: null,
    }));
  }, [setState]);

  // === Editing Handlers ===
  const handleTextboxEditingChange = useCallback(
    (isEditing: boolean) => {
      setState((prev) => ({ ...prev, isTextboxEditing: isEditing }));
    },
    [setState]
  );

  const handleImageEditingChange = useCallback(
    (isEditing: boolean) => {
      setState((prev) => ({ ...prev, isImageEditing: isEditing }));
    },
    [setState]
  );

  // === Keyboard Handlers ===
  // Note: Arrow nudge routing was moved to InteractionLayerStack slot 'item'.
  // This handler retains only ESC-cancel-drag state machine logic.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const { selectedElement, isDragging, isResizing } = state;
      if (!selectedElement || !isEditable) return;

      // ESC: cancel in-flight drag/resize and restore original geometry
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
        }
        // Deselect (non-drag ESC) is handled by slot 'item'.onHotkey → handleElementSelect(null)
        return;
      }
    },
    [
      state,
      isEditable,
      updateElementGeometry,
      setState,
    ]
  );

  // === Nudge Handler (used by InteractionLayerStack slot 'item'.onHotkey) ===
  const handleNudgeSelectedItem = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const { selectedElement, isTextboxEditing, isImageEditing } = state;
      if (!selectedElement || !canDragItem) return;
      if (isTextboxEditing || isImageEditing) return;
      const geometry = getSelectedGeometry();
      if (!geometry) return;
      updateElementGeometry(selectedElement, applyNudge(geometry, direction, CANVAS.NUDGE_STEP));
    },
    [state, canDragItem, getSelectedGeometry, updateElementGeometry]
  );

  // === Wrapper callback for page updates (used by PageItem) ===
  const handleUpdatePage = useCallback(
    (pageIndex: number, updates: Record<string, unknown>) => {
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

  return {
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
  };
}
