// use-editor-selection.ts — Manages canvas element selection state, including
// click-to-select, external selection sync (sidebar → canvas), click-outside
// deselect, geometry resolution for the selection frame, and spread reset.

import {
  useState,
  useCallback,
  useEffect,
  type RefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import { getTextboxContentForLanguage } from "../../../utils/textbox-helpers";
import { createLogger } from "@/utils/logger";
import type {
  BaseSpread,
  SelectedElement,
  Geometry,
} from "@/types/canvas-types";
import type { EditorState } from "../spread-editor-panel";

const log = createLogger("Editor", "useEditorSelection");

// Fixed pixel size of audio/quiz icon elements (w-8 h-8 = 32px)
const ICON_ELEMENT_PX = 32;

// === Params ===

interface UseEditorSelectionParams<TSpread extends BaseSpread> {
  spread: TSpread;
  canvasRef: RefObject<HTMLDivElement | null>;
  externalSelectedItemId?: { type: string; id: string } | null;
  /**
   * @deprecated Kept for backward compat with callers; click-outside is now
   * routed through the InteractionLayerStack (slot 'spread'.onClickOutside).
   * This hook no longer reads it.
   */
  onDeselect?: () => void;
  editorLangCode: string;
}

// === Return type ===

interface UseEditorSelectionReturn {
  state: EditorState;
  setState: Dispatch<SetStateAction<EditorState>>;
  handleElementSelect: (element: SelectedElement | null) => void;
  handleCanvasClick: (e: React.MouseEvent) => void;
  getSelectedGeometry: () => Geometry | null;
  computeIconGeometry: (baseGeo: Geometry) => Geometry;
}

// === Hook ===

export function useEditorSelection<TSpread extends BaseSpread>({
  spread,
  canvasRef,
  externalSelectedItemId,
  editorLangCode,
}: UseEditorSelectionParams<TSpread>): UseEditorSelectionReturn {
  // Compute geometry for icon-based elements (audio/quiz) — converts fixed
  // pixel size to percentage relative to the canvas container's actual dimensions.
  const computeIconGeometry = useCallback((baseGeo: Geometry): Geometry => {
    const canvas = canvasRef.current;
    if (!canvas) return baseGeo;
    const w = (ICON_ELEMENT_PX / canvas.clientWidth) * 100;
    const h = (ICON_ELEMENT_PX / canvas.clientHeight) * 100;
    return { x: baseGeo.x, y: baseGeo.y, w, h };
  }, [canvasRef]);

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

  // Note: click-outside deselect is now routed via InteractionLayerStack
  // slot 'item'.onClickOutside → handleElementSelect(null)
  // and slot 'spread'.onClickOutside → onDeselect?.()
  // The document mousedown listener has been removed.

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
    [handleElementSelect, canvasRef]
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

  return {
    state,
    setState,
    handleElementSelect,
    handleCanvasClick,
    getSelectedGeometry,
    computeIconGeometry,
  };
}
