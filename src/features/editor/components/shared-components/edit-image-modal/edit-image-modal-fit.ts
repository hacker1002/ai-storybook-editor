// edit-image-modal-fit.ts — Shared image-sizing logic for the EditImageModal stage.
//
// Why: the three canvas modes (preview <img>, compare slider, eraser canvas) were each
// computing display dimensions with a different formula, so the SAME image rendered at
// different sizes depending on which tab/mode the user was in. This module gives all three
// a single fit calculation so mode-switching never changes apparent image size.
//
// Rules (per user spec):
//   1. natural ≤ frame → render at natural size (no upscale)
//   2. natural > frame → scale down to fit frame, preserving aspect ratio
//   3. The CSS zoom transform (in edit-image-modal-canvas) is an additional user-controlled
//      multiplier on top of the fit size — it does NOT replace the fit.

import { useEffect, useMemo, useState } from 'react';
import {
  HEADER_HEIGHT_PX,
  LEFT_SIDEBAR_WIDTH_PX,
  RIGHT_SIDEBAR_WIDTH_PX,
} from './edit-image-modal-constants';

// Canvas pane padding (p-6 = 24px × 2 sides).
const STAGE_PADDING_PX = 48;
// Vertical chrome = modal header (49) + stage header (49) + p-6 (48).
const STAGE_VERTICAL_CHROME_PX = HEADER_HEIGHT_PX + HEADER_HEIGHT_PX + STAGE_PADDING_PX;
// Horizontal chrome = versions sidebar (300) + parameters sidebar (320) + p-6 (48).
const STAGE_HORIZONTAL_CHROME_PX =
  LEFT_SIDEBAR_WIDTH_PX + RIGHT_SIDEBAR_WIDTH_PX + STAGE_PADDING_PX;
const FRAME_MIN_PX = 240;

export interface Size {
  w: number;
  h: number;
}

export function computeFrameSize(viewportW: number, viewportH: number): Size {
  return {
    w: Math.max(FRAME_MIN_PX, viewportW - STAGE_HORIZONTAL_CHROME_PX),
    h: Math.max(FRAME_MIN_PX, viewportH - STAGE_VERTICAL_CHROME_PX),
  };
}

/** Fit naturalW×naturalH into `frame`, preserving aspect ratio.
 *  NEVER upscales — `Math.min(ratio, 1)` clamps so small images stay at natural size and
 *  the zoom slider remains the only way to enlarge. */
export function fitNaturalToFrame(naturalW: number, naturalH: number, frame: Size): Size {
  const ratio = Math.min(frame.w / naturalW, frame.h / naturalH, 1);
  return { w: Math.round(naturalW * ratio), h: Math.round(naturalH * ratio) };
}

function readViewport(): Size {
  if (typeof window === 'undefined') return { w: 1200, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
}

/** Track viewport size, recompute on resize. Shared by both preview/compare and eraser. */
export function useViewport(): Size {
  const [viewport, setViewport] = useState<Size>(readViewport);
  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return viewport;
}

/** Fitted display size for a given natural image, accounting for live viewport. Returns
 *  null until natural dimensions are known (component should render nothing or a placeholder). */
export function useStageFitSize(naturalW: number, naturalH: number): Size | null {
  const viewport = useViewport();
  return useMemo(() => {
    if (!naturalW || !naturalH) return null;
    return fitNaturalToFrame(naturalW, naturalH, computeFrameSize(viewport.w, viewport.h));
  }, [naturalW, naturalH, viewport]);
}

/** Probe an image URL's natural dimensions (decoded out-of-band; doesn't block the DOM image
 *  element). Browser cache makes the second call free when the same URL is also rendered
 *  on-screen. Returns null until load resolves. */
export function useImageNaturalSize(url: string | undefined | null): Size | null {
  // Key the loaded size by its url so staleness is DERIVED in render (loaded.url === url)
  // instead of reset via a synchronous setState in the effect body (React 19
  // react-hooks/set-state-in-effect). The only setState here runs in the async onload
  // callback, which is allowed. Same observable behavior: a url change reads as null until
  // the new image decodes.
  const [loaded, setLoaded] = useState<{ url: string; size: Size } | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (cancelled || img.naturalWidth === 0) return;
      setLoaded({ url, size: { w: img.naturalWidth, h: img.naturalHeight } });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return loaded && loaded.url === url ? loaded.size : null;
}
