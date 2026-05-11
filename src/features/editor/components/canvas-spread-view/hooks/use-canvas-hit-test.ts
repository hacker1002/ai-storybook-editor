// use-canvas-hit-test.ts — Canvas-level hit-test hook for ADR-029 smart hit-test.
//
// Phase 2: hover preview (rAF-throttled mousemove → hoveredTargetId).
// Phase 3: handleMouseDownCapture (click hijack — capture-phase).
// Phase 5: dimmedItemIds (covering-item computation).
//
// Hook is stateless re: rendering — owns only hoveredTargetId + rAF ref.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { BaseSpread, ItemType, SelectedElement } from "@/types/canvas-types";
import { createLogger } from "@/utils/logger";
import {
  collectHitItems,
  computeBestTarget,
  enumerateAllHitCandidates,
  findCoveringItems,
  type Geometry,
  type HitCandidate,
} from "../utils/hit-test";
import { containmentRatio } from "../utils/hit-test";
import { resolveItemZIndex } from "../utils/resolve-item-z-index";
import {
  resolveEffectiveZIndex,
  type CompositeContext,
} from "@/features/editor/utils/composite-resolve-helpers";
import { getTextboxContentForLanguage } from "@/features/editor/utils/textbox-helpers";

const log = createLogger("Editor", "useCanvasHitTest");

const EMPTY_SET: ReadonlySet<string> = new Set();

export interface UseCanvasHitTestOptions {
  spread: BaseSpread;
  selectedElement: SelectedElement | null;
  editingItemId: string | null;
  isAnimationOverlayActive: boolean;
  itemInteractionDisabled: boolean;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  smartHitTestEnabled: boolean;
  editorCompositeCtxMap: Map<string, CompositeContext>;
  preventEditRawItem: boolean;
  isDragging: boolean;
  isResizing: boolean;
  isRotating: boolean;
  /** Active editor language — needed because textbox geometry is nested
   *  per-language (`textbox[lang].geometry`). Hit-test mirrors the renderer's
   *  language resolution to include textboxes in candidates. */
  langCode: string;
  /** Phase 3 — invoked when click hijack fires with the best target. */
  onSelect?: (target: HitCandidate) => void;
}

export interface UseCanvasHitTestReturn {
  hoveredTargetId: string | null;
  hoveredGeometry: Geometry | null;
  dimmedItemIds: ReadonlySet<string>;
  handleMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  handleMouseLeave: () => void;
  handleMouseDownCapture: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** Block subsequent click bubbling to per-item onClick when mousedown hijack
   *  already redirected selection. Without this, click still propagates to the
   *  natural-target's React onClick and overwrites the hijacked selection. */
  handleClickCapture: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function shouldSuppressInteraction(opts: {
  smartHitTestEnabled: boolean;
  editingItemId: string | null;
  isAnimationOverlayActive: boolean;
  itemInteractionDisabled: boolean;
}): boolean {
  if (!opts.smartHitTestEnabled) return true;
  if (opts.editingItemId !== null) return true;
  if (opts.isAnimationOverlayActive) return true;
  if (opts.itemInteractionDisabled) return true;
  return false;
}

function shouldSuppressHoverPreview(opts: {
  smartHitTestEnabled: boolean;
  editingItemId: string | null;
  isAnimationOverlayActive: boolean;
  itemInteractionDisabled: boolean;
  isDragging: boolean;
  isResizing: boolean;
  isRotating: boolean;
}): boolean {
  if (shouldSuppressInteraction(opts)) return true;
  if (opts.isDragging || opts.isResizing || opts.isRotating) return true;
  return false;
}

function isMoveableHandle(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return !!(
    el.closest(".moveable-control") ||
    el.closest(".moveable-line") ||
    el.closest(".moveable-area")
  );
}

// Phase 3 fix: skip canvas-level hijack when mousedown originates on the
// SelectionFrame's drag-target div. Otherwise capture-phase preventDefault()
// blocks Moveable's mousedown → drag fails. The Phase 4 hook
// `useFrameClickNoDragHijack` listens on the same target and handles the
// click-no-drag-to-switch case separately at mouseup time.
function isSelectionFrameTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return !!el.closest('[data-selection-frame-target="true"]');
}

function resolveNaturalTargetId(
  target: EventTarget | null,
  canvasEl: HTMLElement | null,
): string | null {
  if (!canvasEl) return null;
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== canvasEl) {
    const id = el.dataset?.itemId;
    if (id) return id;
    el = el.parentElement;
  }
  return null;
}

function selectedToHitCandidate(
  selectedElement: SelectedElement | null,
  spread: BaseSpread,
  ctxMap: Map<string, CompositeContext>,
  langCode: string,
): HitCandidate | null {
  if (!selectedElement || selectedElement.type === "page") return null;
  const sel = selectedElement;
  // Raw items are not part of smart hit-test (illustration layer).
  if (sel.type === "raw_image" || sel.type === "raw_textbox") return null;

  type ItemMaybe = {
    id?: string;
    geometry?: { x?: number; y?: number; w?: number; h?: number; rotation?: number };
  };
  let item: ItemMaybe | undefined;
  switch (sel.type) {
    case "image": item = spread.images?.[sel.index]; break;
    case "textbox": item = spread.textboxes?.[sel.index]; break;
    case "shape": item = spread.shapes?.[sel.index]; break;
    case "video": item = spread.videos?.[sel.index]; break;
    case "auto_pic": item = spread.auto_pics?.[sel.index]; break;
    case "audio": item = spread.audios?.[sel.index] as ItemMaybe | undefined; break;
    case "auto_audio": item = spread.auto_audios?.[sel.index] as ItemMaybe | undefined; break;
    case "quiz": item = spread.quizzes?.[sel.index] as ItemMaybe | undefined; break;
  }
  if (!item || !item.id) return null;

  // Textbox: geometry nested per-language. Resolve via the same helper as the renderer.
  let g: { x: number; y: number; w: number; h: number; rotation?: number } | null = null;
  if (sel.type === "textbox") {
    const result = getTextboxContentForLanguage(
      item as Record<string, unknown>,
      langCode,
    );
    if (result?.content?.geometry) g = result.content.geometry;
  } else if (item.geometry) {
    const raw = item.geometry;
    if (
      typeof raw.x === "number" &&
      typeof raw.y === "number" &&
      typeof raw.w === "number" &&
      typeof raw.h === "number"
    ) {
      g = { x: raw.x, y: raw.y, w: raw.w, h: raw.h, rotation: raw.rotation };
    }
  }
  if (!g) return null;

  const baseZ = resolveItemZIndex(sel.type as ItemType, sel.index, spread);
  const effZ = resolveEffectiveZIndex(
    { id: item.id, "z-index": baseZ },
    ctxMap,
  );
  return {
    id: item.id,
    type: sel.type as HitCandidate["type"],
    index: sel.index,
    geometry: {
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      rotation: typeof g.rotation === "number" ? g.rotation : 0,
    },
    zIndex: effZ,
  };
}

export function useCanvasHitTest(
  options: UseCanvasHitTestOptions,
): UseCanvasHitTestReturn {
  const {
    spread,
    selectedElement,
    editingItemId,
    isAnimationOverlayActive,
    itemInteractionDisabled,
    canvasRef,
    smartHitTestEnabled,
    editorCompositeCtxMap,
    preventEditRawItem,
    isDragging,
    isResizing,
    isRotating,
    langCode,
    onSelect,
  } = options;

  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);
  const hoveredTargetIdRef = useRef<string | null>(null);
  hoveredTargetIdRef.current = hoveredTargetId;
  const rafIdRef = useRef<number | null>(null);
  const latestPointRef = useRef<{ x: number; y: number } | null>(null);
  // True when mousedown hijack just redirected selection — block the following
  // click so the natural-target's onClick can't overwrite the hijacked target.
  const lastHijackedDownRef = useRef(false);

  // Mirror props into refs so the rAF callback (closure captured once) reads
  // the latest values without re-binding on every render.
  const stateRef = useRef({
    smartHitTestEnabled,
    editingItemId,
    isAnimationOverlayActive,
    itemInteractionDisabled,
    isDragging,
    isResizing,
    isRotating,
    spread,
    editorCompositeCtxMap,
    preventEditRawItem,
    langCode,
  });
  stateRef.current = {
    smartHitTestEnabled,
    editingItemId,
    isAnimationOverlayActive,
    itemInteractionDisabled,
    isDragging,
    isResizing,
    isRotating,
    spread,
    editorCompositeCtxMap,
    preventEditRawItem,
    langCode,
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!stateRef.current.smartHitTestEnabled) return;
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      latestPointRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      };
      if (rafIdRef.current !== null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const point = latestPointRef.current;
        if (!point) return;
        const s = stateRef.current;
        if (shouldSuppressHoverPreview(s)) {
          if (hoveredTargetIdRef.current !== null) setHoveredTargetId(null);
          return;
        }
        const candidates = collectHitItems(
          s.spread,
          point,
          s.editorCompositeCtxMap,
          {
            preventEditRawItem: s.preventEditRawItem,
            editingItemId: s.editingItemId,
            langCode: s.langCode,
          },
        );
        const target = computeBestTarget(candidates);
        const newId = target?.id ?? null;
        if (newId !== hoveredTargetIdRef.current) {
          setHoveredTargetId(newId);
        }
      });
    },
    [canvasRef],
  );

  const handleMouseLeave = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    latestPointRef.current = null;
    if (hoveredTargetIdRef.current !== null) {
      setHoveredTargetId(null);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const handleMouseDownCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Reset the click-block ref on every new gesture so stale state from a
      // previous hijack (e.g. drag aborted before click fired) can't block the
      // next unrelated click.
      lastHijackedDownRef.current = false;
      const s = stateRef.current;
      if (shouldSuppressInteraction(s)) return;
      if (isMoveableHandle(e.target)) return;
      // Phase 3 fix (ADR-029): skip when target is the SelectionFrame's
      // full-body drag layer — preventDefault here kills Moveable's drag.
      // Phase 4 hook handles click-no-drag switch at mouseup separately.
      if (isSelectionFrameTarget(e.target)) return;
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;
      const rect = canvasEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const point = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      };
      const naturalId = resolveNaturalTargetId(e.target, canvasEl);
      const candidates = collectHitItems(
        s.spread,
        point,
        s.editorCompositeCtxMap,
        {
          preventEditRawItem: s.preventEditRawItem,
          editingItemId: s.editingItemId,
          langCode: s.langCode,
        },
      );
      const best = computeBestTarget(candidates);
      if (!best) return;
      if (best.id === naturalId) return;
      // Mark: ensuing click on same gesture must be swallowed so it doesn't
      // bubble to natural-target's React onClick and overwrite hijacked selection.
      lastHijackedDownRef.current = true;
      e.stopPropagation();
      // preventDefault blocks the browser's native mousedown side effects
      // (focus shifts, text-input caret placement). Safe because
      // shouldSuppressInteraction above bails out when editingItemId is set,
      // so we never block native focus while a contentEditable is active.
      e.preventDefault();
      if (onSelect) onSelect(best);
      const natural = naturalId
        ? candidates.find((c) => c.id === naturalId)
        : undefined;
      const ratio = natural
        ? containmentRatio(best.geometry, natural.geometry)
        : null;
      log.debug("handleMouseDownCapture", "containment-override", {
        from: naturalId,
        to: best.id,
        ratio,
      });
    },
    [canvasRef, onSelect],
  );

  // Block the click event following a hijacked mousedown — otherwise per-item
  // onClick on the natural target overwrites the hijack's selection.
  const handleClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!lastHijackedDownRef.current) return;
      lastHijackedDownRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    },
    [],
  );

  // === Hovered geometry lookup ===
  // Reuse enumerateAllHitCandidates (which already resolves textbox per-language)
  // so hover preview matches what hit-test selects.
  const hoveredGeometry = useMemo<Geometry | null>(() => {
    if (!hoveredTargetId) return null;
    const all = enumerateAllHitCandidates(spread, editorCompositeCtxMap, langCode);
    const hit = all.find((c) => c.id === hoveredTargetId);
    return hit ? hit.geometry : null;
  }, [hoveredTargetId, spread, editorCompositeCtxMap, langCode]);

  // === Phase 5 — dim overlapping items ===
  // Cache key derived from `enumerateAllHitCandidates` so textboxes (whose
  // geometry is per-language) participate correctly.
  const spreadItemsGeometryKey = useMemo(() => {
    if (!smartHitTestEnabled) return "";
    const all = enumerateAllHitCandidates(spread, editorCompositeCtxMap, langCode);
    return all
      .map(
        (c) =>
          `${c.id}:${c.geometry.x},${c.geometry.y},${c.geometry.w},${c.geometry.h},${c.geometry.rotation ?? 0},${c.zIndex}`,
      )
      .join("|");
  }, [smartHitTestEnabled, spread, editorCompositeCtxMap, langCode]);

  const dimmedItemIds = useMemo<ReadonlySet<string>>(() => {
    if (!smartHitTestEnabled) return EMPTY_SET;
    const selectedHC = selectedToHitCandidate(
      selectedElement,
      spread,
      editorCompositeCtxMap,
      langCode,
    );
    if (!selectedHC) return EMPTY_SET;
    const allHC = enumerateAllHitCandidates(spread, editorCompositeCtxMap, langCode);
    const covering = findCoveringItems(selectedHC, allHC);
    if (covering.length === 0) return EMPTY_SET;
    return new Set(covering.map((c) => c.id));
    // spreadItemsGeometryKey acts as a stable hash of items[id/geom/z]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    smartHitTestEnabled,
    selectedElement?.type,
    selectedElement?.index,
    spreadItemsGeometryKey,
    editorCompositeCtxMap,
  ]);

  return {
    hoveredTargetId,
    hoveredGeometry,
    dimmedItemIds,
    handleMouseMove,
    handleMouseLeave,
    handleMouseDownCapture,
    handleClickCapture,
  };
}
