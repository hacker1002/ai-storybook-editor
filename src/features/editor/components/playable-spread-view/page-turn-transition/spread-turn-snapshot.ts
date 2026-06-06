// spread-turn-snapshot.ts - Deep-clone the live spread DOM into detached node(s)
// so the overlay can render the "outgoing" page during a turn. For `spread`
// layout, two independent clones are produced because a single Node cannot have
// two parents (Static + FlippingCard need their own).
//
// Media handling — render-parity (design 07): a raw cloneNode of <video>/<canvas>
// is BLANK (a cloned <video> reloads from t=0; a canvas bitmap lives in its 2D/GL
// context, not the DOM, so it clones empty). The old code stripped both, which is
// why live videos VANISHED for the whole turn. We now FREEZE each live <video> /
// <canvas> into a still <canvas> drawn from its current pixels — mirroring the
// Remotion render side, which freezes every face's media via <Freeze frame>. So
// the turning leaf shows the same frozen frame the user saw the instant the turn
// started. <audio>/<script> are still removed (no visual; would replay/re-execute).

import { createLogger } from '@/utils/logger';
import type { TurnDirection, TurnLayout, TurnSnapshot } from './spread-turn-types';

const log = createLogger('Editor', 'SpreadTurnSnapshot');

/** Visual media frozen into a still <canvas> (see header). Index-aligned between
 *  the live source tree and its clone — cloneNode(true) preserves document order. */
const FREEZE_SELECTOR = 'video, canvas';

/** Non-visual tags whose clones would replay / re-execute. Removed from the clone. */
const STRIP_SELECTOR = 'audio, script';

/** Inline event-handler attributes — defensive cleanup so that any stale bindings
 *  on the cloned tree cannot fire from the overlay. Extend as needed. */
const STRIP_ATTRS = ['onclick', 'onmouseenter', 'onmouseleave', 'onload', 'onerror'];

/** Draw a live <video>/<canvas>'s CURRENT pixels onto a fresh detached <canvas>.
 *  Returns null when the source has no decoded frame yet (videoWidth 0) or the
 *  draw throws (e.g. a WebGL canvas without preserveDrawingBuffer) — caller then
 *  falls back to removing the node so a blank/reloading element never leaks onto
 *  the leaf. Cross-origin taint is irrelevant: we only DISPLAY the canvas, never
 *  read it back (no toDataURL/getImageData), so no crossOrigin attr is required. */
function captureMediaFrame(el: HTMLVideoElement | HTMLCanvasElement): HTMLCanvasElement | null {
  try {
    const iw = el instanceof HTMLVideoElement ? el.videoWidth : el.width;
    const ih = el instanceof HTMLVideoElement ? el.videoHeight : el.height;
    if (!iw || !ih) return null;
    const out = document.createElement('canvas');
    out.width = iw;
    out.height = ih;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(el, 0, 0, iw, ih);
    return out;
  } catch (err) {
    log.warn('captureMediaFrame', 'frame capture failed — element will be stripped', {
      tag: el.tagName,
      error: String(err),
    });
    return null;
  }
}

/** Replace each blank cloned <video>/<canvas> with a still drawn from the matching
 *  LIVE element's current pixels. Source/clone are index-aligned (cloneNode keeps
 *  order; audio/script — a disjoint tag set — are stripped afterwards so they don't
 *  perturb the video/canvas indices). The frozen canvas inherits the clone node's
 *  className + inline style so layout (object-fit, geometry %) is pixel-identical. */
function freezeMediaIntoClone(source: HTMLElement, clone: HTMLElement): void {
  const liveMedia = source.querySelectorAll<HTMLVideoElement | HTMLCanvasElement>(FREEZE_SELECTOR);
  const cloneMedia = clone.querySelectorAll<HTMLElement>(FREEZE_SELECTOR);
  const n = Math.min(liveMedia.length, cloneMedia.length);
  for (let i = 0; i < n; i++) {
    const cloneEl = cloneMedia[i];
    if (!cloneEl.parentNode) continue;
    const frozen = captureMediaFrame(liveMedia[i]);
    if (frozen) {
      frozen.className = cloneEl.className;
      frozen.style.cssText = cloneEl.style.cssText;
      cloneEl.parentNode.replaceChild(frozen, cloneEl);
    } else {
      cloneEl.remove();
    }
  }
}

/** Deep-clone the container, freeze live media into stills, strip replay-only tags
 *  + inline event handlers.
 *  Also resets the root clone's transform/transition: in fullPageMode the live
 *  container has `translateX(panOffsetX)` baked inline (to pan visible page
 *  inside the wrapper), but the overlay positions us at the post-transform
 *  rect already and wants the clone to fill its box without any further pan —
 *  otherwise the clone's content lands outside the overlay's visible region. */
function deepCloneAndStrip(container: HTMLElement): HTMLElement {
  const clone = container.cloneNode(true) as HTMLElement;

  // Freeze video/canvas BEFORE stripping audio/script (must read live pixels).
  freezeMediaIntoClone(container, clone);

  const strippable = clone.querySelectorAll(STRIP_SELECTOR);
  strippable.forEach((el) => el.remove());

  const allElements = clone.querySelectorAll<HTMLElement>('*');
  allElements.forEach((el) => {
    STRIP_ATTRS.forEach((attr) => {
      if (el.hasAttribute(attr)) el.removeAttribute(attr);
    });
  });

  clone.style.transform = 'none';
  clone.style.transition = 'none';
  // Drop the live container's `shadow-lg` — during 3D rotation the box-shadow
  // rotates with the box and projects as a transient bottom band at non-zero
  // tilt angles. The live spread underneath still owns the resting shadow.
  clone.style.boxShadow = 'none';

  return clone;
}

/**
 * Clone the spread container into off-DOM nodes ready to be appended into the
 * overlay's layers. Returns `null` if the container is missing — caller should
 * bypass the transition in that case.
 *
 * Always returns 2 independent clones (StaticLayer + FlippingCard each need
 * their own — a Node cannot have two parents). Layout-uniform behavior.
 */
export function takeSnapshot(
  container: HTMLElement | null,
  direction: TurnDirection,
  layout: TurnLayout,
): TurnSnapshot | null {
  if (!container) {
    log.warn('takeSnapshot', 'no container provided — cannot snapshot', { direction, layout });
    return null;
  }

  const flippingNode = deepCloneAndStrip(container);
  const staticNode = deepCloneAndStrip(container);

  const dimensions = {
    width: container.offsetWidth,
    height: container.offsetHeight,
  };

  log.debug('takeSnapshot', 'snapshot ready', {
    direction,
    layout,
    width: dimensions.width,
    height: dimensions.height,
  });

  return {
    staticNode,
    flippingNode,
    dimensions,
    direction,
    layout,
  };
}
