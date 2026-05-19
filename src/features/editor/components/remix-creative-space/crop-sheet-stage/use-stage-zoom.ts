// use-stage-zoom.ts — Fit-to-canvas + center-anchored zoom for StageCanvas
// (design 05-03-crop-sheet-stage.md §4.2 fit, §4.3 anchor, §4.8 edge cases).
//
// Single consumer: StageCanvas in crop-sheet-stage.tsx. Extracted so the
// component stays under 500 lines and the three pure helpers are unit-testable
// (use-stage-zoom.test.ts) without a React render harness.
//
// Zoom is applied as the canvas-inner real `width/height` (not transform:
// scale) so `scrollWidth/Height` reflect true content size — anchor scrolling
// depends on accurate scroll metrics.

import { useCallback, useLayoutEffect, useRef } from 'react';
import { createLogger } from '@/utils/logger';
import { ZOOM } from '../swap-modal-constants';

const log = createLogger('Editor', 'useStageZoom');

export interface SheetGeometry {
  width: number;
  height: number;
}

interface UseStageZoomParams {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** null when the active tab has no sheet — hook then no-ops. */
  sheetGeometry: SheetGeometry | null;
  /** Current zoom % (from the modal, single source of truth). */
  zoomLevel: number;
  /** Reports a computed fit zoom back up to the modal. */
  onZoomChange: (zoom: number) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Clamps a scroll offset into `[0, maxScroll]`. `maxScroll` is negative when
 *  the content is smaller than the viewport — the result is then 0. */
function clampScrollOffset(value: number, maxScroll: number): number {
  return Math.max(0, Math.min(value, maxScroll));
}

/** Largest zoom % at which `sheet` fits entirely inside `viewport`, snapped
 *  DOWN to a `ZOOM.step` multiple (floor — the sheet must always sit fully
 *  inside the frame; round could overflow ≤ 2.5%) and clamped to
 *  `[ZOOM.min, ZOOM.max]`. Returns null when the sheet or the viewport has no
 *  measurable size yet (modal still animating open). */
export function computeFitZoom(
  viewport: { width: number; height: number },
  sheet: SheetGeometry | null,
): number | null {
  if (sheet === null || sheet.width <= 0 || sheet.height <= 0) return null;
  if (viewport.width <= 0 || viewport.height <= 0) return null;
  const fitScale = Math.min(
    viewport.width / sheet.width,
    viewport.height / sheet.height,
  );
  const snapped = Math.floor((fitScale * 100) / ZOOM.step) * ZOOM.step;
  return clamp(snapped, ZOOM.min, ZOOM.max);
}

/** Re-positions `viewportEl` scroll so the content point currently at the
 *  viewport center stays fixed across a zoom change (design §4.3). The caller
 *  MUST have applied the new canvas-inner size before invoking this —
 *  `scrollWidth/Height` are read post-resize. */
export function applyZoomKeepingViewportCenter(
  viewportEl: HTMLElement,
  prevZoom: number,
  nextZoom: number,
): void {
  if (prevZoom === nextZoom || prevZoom <= 0) return;
  const ratio = nextZoom / prevZoom;
  const { clientWidth: vw, clientHeight: vh, scrollWidth, scrollHeight } =
    viewportEl;
  const centerX = viewportEl.scrollLeft + vw / 2;
  const centerY = viewportEl.scrollTop + vh / 2;
  viewportEl.scrollLeft = clampScrollOffset(
    centerX * ratio - vw / 2,
    scrollWidth - vw,
  );
  viewportEl.scrollTop = clampScrollOffset(
    centerY * ratio - vh / 2,
    scrollHeight - vh,
  );
}

/** Clamps `viewportEl` scroll back into the valid range. Used on window resize
 *  where the zoom is unchanged, so no center re-anchoring is needed
 *  (validation S1: modal is full-screen, the viewport rarely resizes). */
export function clampScroll(viewportEl: HTMLElement): void {
  const { clientWidth, clientHeight, scrollWidth, scrollHeight } = viewportEl;
  viewportEl.scrollLeft = clampScrollOffset(
    viewportEl.scrollLeft,
    scrollWidth - clientWidth,
  );
  viewportEl.scrollTop = clampScrollOffset(
    viewportEl.scrollTop,
    scrollHeight - clientHeight,
  );
}

/** Drives StageCanvas zoom: auto-fit once per sheet geometry, re-anchor scroll
 *  on every zoom change, and retry a deferred fit / clamp scroll on resize.
 *  Pure side-effects only — no state, so it is safe to call before an early
 *  return as long as the call site keeps it unconditional (Rules of Hooks). */
export function useStageZoom({
  viewportRef,
  sheetGeometry,
  zoomLevel,
  onZoomChange,
}: UseStageZoomParams): void {
  // The geometry key a fit has already been computed for — guards against
  // re-fitting (and the onZoomChange → re-render loop) for the same sheet.
  const fitKeyRef = useRef<string | null>(null);
  // Previous zoom — seeded with the initial zoom so the first anchor pass is
  // a no-op (the first fit happens at scroll 0).
  const prevZoomRef = useRef<number>(zoomLevel);

  const geomKey =
    sheetGeometry !== null
      ? `${sheetGeometry.width}×${sheetGeometry.height}`
      : null;

  // Computes the fit zoom against the live viewport size and reports it once
  // per geometry. Leaves `fitKeyRef` unset when the viewport is not measured
  // yet so the ResizeObserver can retry. Re-fit is keyed purely on geometry —
  // a no-sheet (`geomKey === null`) interlude keeps the lock, so returning to
  // the same geometry does not discard a manual zoom.
  const tryFit = useCallback(
    (source: 'layout' | 'resize') => {
      if (geomKey === null || geomKey === fitKeyRef.current) return;
      const viewport = viewportRef.current;
      if (viewport === null) return;
      const fitZoom = computeFitZoom(
        { width: viewport.clientWidth, height: viewport.clientHeight },
        sheetGeometry,
      );
      if (fitZoom === null) {
        log.debug('tryFit', 'fit deferred — viewport not measured', {
          source,
          geomKey,
          vw: viewport.clientWidth,
          vh: viewport.clientHeight,
        });
        return;
      }
      // Lock the fit for this geometry, then report. `setZoomLevel` bails the
      // re-render when `fitZoom` already equals the current zoom, so no guard
      // on `zoomLevel` is needed here — keeping `tryFit` independent of it
      // avoids re-subscribing the ResizeObserver on every zoom change.
      fitKeyRef.current = geomKey;
      log.info('tryFit', 'fit applied', { source, fitZoom, geomKey });
      onZoomChange(fitZoom);
    },
    [geomKey, sheetGeometry, onZoomChange, viewportRef],
  );

  // ── Fit: once per sheet geometry, before paint (avoids a 100% flash) ───────
  useLayoutEffect(() => {
    tryFit('layout');
  }, [tryFit]);

  // ── Anchor: keep the viewport-center point fixed across a zoom change ──────
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const prevZoom = prevZoomRef.current;
    if (viewport !== null && prevZoom !== zoomLevel) {
      log.debug('anchor', 'apply center-anchored zoom', {
        prevZoom,
        nextZoom: zoomLevel,
      });
      applyZoomKeepingViewportCenter(viewport, prevZoom, zoomLevel);
    }
    prevZoomRef.current = zoomLevel;
  }, [zoomLevel, viewportRef]);

  // ── ResizeObserver: retry a deferred fit + clamp scroll on resize ─────────
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;

    const observer = new ResizeObserver(() => {
      // (a) Retry a fit deferred because the viewport had no size while the
      //     modal was animating open (design §4.8).
      tryFit('resize');
      // (b) Zoom is unchanged on resize — only clamp scroll into range
      //     (validation S1: no center re-anchor).
      clampScroll(viewport);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [tryFit, viewportRef]);
}
