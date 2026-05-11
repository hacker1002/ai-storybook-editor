// use-frame-click-no-drag-hijack.ts — ADR-029 Phase 4 click-on-frame re-route.
//
// Sticky frame z parks the selection frame on top, which can swallow clicks that
// the user intends for an overlapping item above the selected one. This hook
// listens for mousedown on the frame's drag-target div: if the user releases
// within CLICK_NO_DRAG_THRESHOLD_PX (i.e. a click, not a drag), run hit-test at
// the release point and switch selection to whatever is on top.
//
// State machine:
//   IDLE → mousedown on frame body (not on handle) → ARMED (doc listeners attached)
//   ARMED → mousemove ≥ threshold → drag detected → detach, no-op at mouseup
//   ARMED → mouseup with delta < threshold → hit-test → maybe switch selection

"use client";

import { useCallback, useEffect, useRef } from "react";
import type { BaseSpread, SelectedElement } from "@/types/canvas-types";
import { CLICK_NO_DRAG_THRESHOLD_PX } from "@/constants/spread-constants";
import { createLogger } from "@/utils/logger";
import {
  collectHitItems,
  computeBestTarget,
  type HitCandidate,
} from "../utils/hit-test";
import type { CompositeContext } from "@/features/editor/utils/composite-resolve-helpers";

const log = createLogger("Editor", "useFrameClickNoDragHijack");

export interface UseFrameClickNoDragHijackOptions {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  spread: BaseSpread;
  editorCompositeCtxMap: Map<string, CompositeContext>;
  selectedElement: SelectedElement | null;
  selectedItemId: string | null;
  smartHitTestEnabled: boolean;
  preventEditRawItem: boolean;
  editingItemId: string | null;
  isAnimationOverlayActive: boolean;
  /** Editor language — textbox geometry per-language; hit-test resolves through helper. */
  langCode: string;
  onSwitchSelection: (target: HitCandidate) => void;
}

export interface UseFrameClickNoDragHijackReturn {
  handleFrameMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

function isMoveableHandle(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return !!(
    el.closest(".moveable-control") ||
    el.closest(".moveable-line")
  );
}

export function useFrameClickNoDragHijack(
  options: UseFrameClickNoDragHijackOptions,
): UseFrameClickNoDragHijackReturn {
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const armedRef = useRef(false);
  const docMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const docUpRef = useRef<((e: MouseEvent) => void) | null>(null);

  const stateRef = useRef(options);
  useEffect(() => {
    stateRef.current = options;
  });

  const detachListeners = useCallback(() => {
    if (docMoveRef.current) {
      document.removeEventListener("mousemove", docMoveRef.current);
      docMoveRef.current = null;
    }
    if (docUpRef.current) {
      document.removeEventListener("mouseup", docUpRef.current);
      docUpRef.current = null;
    }
  }, []);

  const handleFrameMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const s = stateRef.current;
      if (!s.smartHitTestEnabled) return;
      if (s.editingItemId !== null) return;
      if (s.isAnimationOverlayActive) return;
      if (isMoveableHandle(e.target)) return;

      startPosRef.current = { x: e.clientX, y: e.clientY };
      armedRef.current = true;

      const onMove = (ev: MouseEvent) => {
        if (!armedRef.current || !startPosRef.current) return;
        const dx = Math.abs(ev.clientX - startPosRef.current.x);
        const dy = Math.abs(ev.clientY - startPosRef.current.y);
        if (Math.max(dx, dy) >= CLICK_NO_DRAG_THRESHOLD_PX) {
          armedRef.current = false;
          detachListeners();
        }
      };

      const onUp = (ev: MouseEvent) => {
        const wasArmed = armedRef.current;
        armedRef.current = false;
        const start = startPosRef.current;
        startPosRef.current = null;
        detachListeners();
        if (!wasArmed || !start) return;
        const dx = Math.abs(ev.clientX - start.x);
        const dy = Math.abs(ev.clientY - start.y);
        if (Math.max(dx, dy) >= CLICK_NO_DRAG_THRESHOLD_PX) return;

        const canvasEl = stateRef.current.canvasRef.current;
        if (!canvasEl) return;
        const rect = canvasEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const point = {
          x: ((ev.clientX - rect.left) / rect.width) * 100,
          y: ((ev.clientY - rect.top) / rect.height) * 100,
        };
        const snap = stateRef.current;
        const candidates = collectHitItems(
          snap.spread,
          point,
          snap.editorCompositeCtxMap,
          {
            preventEditRawItem: snap.preventEditRawItem,
            editingItemId: snap.editingItemId,
            langCode: snap.langCode,
          },
        );
        const best = computeBestTarget(candidates);
        if (!best) return;
        if (best.id === snap.selectedItemId) return;
        snap.onSwitchSelection(best);
        log.debug("handleFrameMouseDown", "click-no-drag-switch", {
          from: snap.selectedItemId,
          to: best.id,
        });
      };

      docMoveRef.current = onMove;
      docUpRef.current = onUp;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [detachListeners],
  );

  useEffect(() => {
    return () => {
      armedRef.current = false;
      startPosRef.current = null;
      detachListeners();
    };
  }, [detachListeners]);

  return { handleFrameMouseDown };
}
