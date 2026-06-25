// extract-crop-fit.ts — Initial fit-to-view zoom for the Crops-tab canvas (design 05 §4.2).
//
// Mirrors the editor-modal main-view fit pattern (crop-sheet-stage `computeFitZoom`,
// playable-spread `useContainerFit`): contain-fit = `Math.min(widthRatio, heightRatio)` so the
// WHOLE source image stays visible — a crop tool needs every edge reachable to draw boxes.
//
// The Crops zoom is "% of the canvas content-box WIDTH" (the crop <img> wrapper is
// `width: zoom%`, height auto — CSS width, not transform: scale; editor zoom pattern/memory),
// NOT an absolute px scale. So the fit is the largest zoom% at which the image clears BOTH axes:
//   width axis : zoom ≤ 100                                  (wrapper never exceeds frame width)
//   height axis: zoom ≤ 100 · (frameH / frameW) · imgAspect  (image height ≤ frame height)
// → contain = min of the two = bound by the frame's tightest ("shortest" relative) edge.
//
// Pure `computeCropFitZoom` is unit-tested without a render harness; `useCropFitZoom` reports the
// fit up to the modal (single source of truth) ONCE per image — manual zoom afterwards is kept.

import { useLayoutEffect, useRef } from 'react';
import { createLogger } from '@/utils/logger';
import { ZOOM } from '../generate-image-modal/generate-image-modal-constants';

const log = createLogger('Editor', 'useCropFitZoom');

export interface FrameSize {
  w: number;
  h: number;
}

type ZoomBounds = { min: number; max: number; step: number };

/** Largest contain-fit zoom % for the Crops canvas (width-% model), snapped DOWN to a
 *  `ZOOM.step` multiple (floor — never overflow the frame) and clamped to `[min, max]`.
 *  Returns null when the frame or image aspect is not measurable yet (modal still opening /
 *  image not decoded) so the caller's effect can retry. */
export function computeCropFitZoom(
  frame: FrameSize,
  imgAspect: number, // naturalWidth / naturalHeight
  bounds: ZoomBounds = ZOOM,
): number | null {
  if (frame.w <= 0 || frame.h <= 0 || !(imgAspect > 0)) return null;
  // Height-bound zoom%: the zoom at which the image height exactly equals the frame height.
  const heightBoundZoom = (frame.h / frame.w) * imgAspect * 100;
  // Contain: also never exceed 100% (= fill frame width). Whichever binds first wins.
  const fit = Math.min(100, heightBoundZoom);
  const snapped = Math.floor(fit / bounds.step) * bounds.step;
  return Math.min(Math.max(snapped, bounds.min), bounds.max);
}

interface UseCropFitZoomParams {
  /** Crops tab only (showZoom) — the hook no-ops otherwise so other tabs keep their zoom. */
  enabled: boolean;
  /** Canvas content-box size (ResizeObserver). null until measured. */
  frame: FrameSize | null;
  /** Source natural aspect (naturalWidth / naturalHeight). null until the image decodes. */
  imgAspect: number | null;
  /** Refit key — the source URL; a new source re-fits, the same source does not. */
  imageKey: string | null;
  /** Reports the computed fit zoom up to the modal (single source of truth). */
  onZoomChange?: (zoom: number) => void;
}

/** Reports the contain-fit zoom up to the modal ONCE per image, before paint (useLayoutEffect
 *  avoids a 100% → fit flash). Retries automatically as `frame` / `imgAspect` arrive (deps);
 *  the per-URL guard then keeps a later manual zoom or window resize from clobbering it. */
export function useCropFitZoom({
  enabled,
  frame,
  imgAspect,
  imageKey,
  onZoomChange,
}: UseCropFitZoomParams): void {
  const fittedKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    // Re-entering the Crops tab should re-fit (the modal also resets zoom→100 on tab switch and
    // ExtractCanvas stays mounted across tabs, so the guard must clear while disabled).
    if (!enabled) {
      fittedKeyRef.current = null;
      return;
    }
    if (!onZoomChange || imageKey === null || frame === null || imgAspect === null) return;
    if (fittedKeyRef.current === imageKey) return; // already fit this source — keep manual zoom
    const fit = computeCropFitZoom(frame, imgAspect);
    if (fit === null) return; // not measurable yet → effect re-runs when frame/aspect change
    fittedKeyRef.current = imageKey;
    log.info('useCropFitZoom', 'fit applied', { fit, imageKey, frameW: frame.w, frameH: frame.h });
    onZoomChange(fit);
  }, [enabled, frame, imgAspect, imageKey, onZoomChange]);
}
