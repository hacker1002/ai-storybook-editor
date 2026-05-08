// camera-tween-helpers.ts — Camera animation runtime helpers (effect types 18, 19).
//
// 2-phase tween shape (per docs/03-13-animation-camera-effects.md):
//   Phase 1: ease-in (0..easeTime)
//   Phase 3: snap revert at end-of-tween + holdS  (holdS = duration - easeTime)
//
// `addCameraTweenToTimeline` accepts a `resolvedTargetId` override for composite
// Focus targets — engine resolves composite → active variantId before invoking,
// so siblings query excludes the *currently rendered* item not the composite group.

import gsap from 'gsap';
import type { SpreadAnimation } from '@/types/spread-types';
import { CAMERA_DEFAULTS } from '@/constants/playable-constants';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'CameraTweenHelpers');

export function getVisualSiblings(
  spreadEl: HTMLElement | null,
  excludeIds: string | ReadonlySet<string>,
): HTMLElement[] {
  if (!spreadEl) return [];
  const exclude: ReadonlySet<string> =
    typeof excludeIds === 'string' ? new Set([excludeIds]) : excludeIds;
  const all = spreadEl.querySelectorAll<HTMLElement>('[data-item-id]');
  const result: HTMLElement[] = [];
  all.forEach((el) => {
    const id = el.dataset.itemId;
    if (id && !exclude.has(id)) result.push(el);
  });
  return result;
}

export interface CameraTweenOptions {
  /** Fires when the camera tween's first phase starts (respects effect.delay). */
  onStart?: () => void;
  /** Fires when the snap-revert at end of duration completes. */
  onComplete?: () => void;
  /** Additional item IDs to exclude from blur (concurrent animations' targets,
   *  resolved through composite → variantId by the caller). */
  excludeIds?: ReadonlyArray<string>;
}

// Focus tween targets the inner visual layer, NOT the [data-item-id] wrapper.
// Wrapper is `position: static; height: 0`; children are `position: absolute`
// with percentage top/left/width/height resolved against the spread root
// (the nearest positioned ancestor with `transform`). Applying `filter` to the
// wrapper would make IT the containing block (per CSS spec), and the child's
// `top: N%` would resolve against wrapper height 0 → collapse to spread top.
// Targeting the absolute child keeps its containing block stable.
function mapToVisualChildren(siblings: HTMLElement[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const s of siblings) {
    const child = s.firstElementChild as HTMLElement | null;
    if (child) out.push(child);
  }
  return out;
}

export function addCameraTweenToTimeline(
  tl: gsap.core.Timeline,
  anim: SpreadAnimation,
  spreadEl: HTMLElement | null,
  position: number | string,
  resolvedTargetId?: string,
  options?: CameraTweenOptions,
): void {
  const effect = anim.effect;
  const easeTimeMs = effect.payload?.ease_time ?? CAMERA_DEFAULTS.EASE_TIME_MS;
  const durationMs = effect.duration ?? CAMERA_DEFAULTS.DURATION_MS;
  const delayMs = effect.delay ?? 0;
  const easeTimeS = easeTimeMs / 1000;
  const durationS = durationMs / 1000;
  const delayS = delayMs / 1000;
  // Enforce min hold of 50ms so revert never collapses against ease-in end on legacy data
  // (UI clamps duration ≥ ease_time + 100ms; this is a defensive floor for stored data).
  const holdS = Math.max(0.05, durationS - easeTimeS);

  if (!spreadEl) {
    log.warn('addCameraTween', 'no spreadEl — skip', { effectType: effect.type });
    return;
  }

  if (effect.type === 18) {
    // Camera Focus
    const targetId = resolvedTargetId ?? anim.target.id;
    // Exclude own target + concurrent anims' targets so siblings stay intact
    // when a Fly In / another Focus runs in parallel (with_previous).
    const excludeSet = new Set<string>([targetId]);
    if (options?.excludeIds) {
      for (const id of options.excludeIds) excludeSet.add(id);
    }
    const siblings = getVisualSiblings(spreadEl, excludeSet);
    const visualEls = mapToVisualChildren(siblings);
    if (visualEls.length === 0) {
      log.warn('addCameraTween.focus', 'no siblings', {
        targetId,
        excludeCount: excludeSet.size,
        siblingCount: siblings.length,
      });
      // Still wire the callbacks so highlight state stays in sync even when
      // there are no items to blur (single-item spread or full exclusion).
      if (options?.onStart) options.onStart();
      if (options?.onComplete) {
        // Defer to honor duration so the highlight persists for the full slot.
        gsap.delayedCall(delayS + durationS, options.onComplete);
      }
      return;
    }
    log.info('addCameraTween.focus', 'building', {
      targetId,
      excludeCount: excludeSet.size,
      siblingCount: siblings.length,
      visualCount: visualEls.length,
      easeTimeS,
      durationS,
    });

    tl.to(
      visualEls,
      {
        filter: `blur(${CAMERA_DEFAULTS.FOCUS_BLUR_PX}px)`,
        duration: easeTimeS,
        delay: delayS,
        ease: CAMERA_DEFAULTS.EASE,
        onStart: options?.onStart,
      },
      position,
    );
    // Pass onComplete in vars (not eventCallback) — zero-duration set fires onComplete
    // via vars reliably, while post-hoc eventCallback can be unset on next tween reset.
    tl.set(
      visualEls,
      { filter: 'none', onComplete: options?.onComplete },
      `>+=${holdS}`,
    );
    return;
  }

  if (effect.type === 19) {
    // Camera Zoom In
    const zg = effect.geometry;
    if (!zg) {
      log.warn('addCameraTween.zoom', 'missing geometry', {});
      return;
    }
    const spreadW = spreadEl.offsetWidth;
    const spreadH = spreadEl.offsetHeight;
    if (spreadW <= 0 || spreadH <= 0) {
      log.warn('addCameraTween.zoom', 'spread element has zero dimensions', { spreadW, spreadH });
      return;
    }
    const scale = 100 / Math.max(0.0001, zg.w);
    const zoomCenterX = ((zg.x + zg.w / 2) / 100) * spreadW;
    const zoomCenterY = ((zg.y + zg.h / 2) / 100) * spreadH;
    // For `transform: translate(tx,ty) scale(s)` with origin (0,0), point (px,py)
    // on the element maps to (tx + s·px, ty + s·py) on the container. Centering
    // the zoom-area center on the container center requires:
    //   tx = spreadW/2 − s·zoomCenterX   (NOT (spreadW/2 − zoomCenterX) × s)
    const translateX = spreadW / 2 - zoomCenterX * scale;
    const translateY = spreadH / 2 - zoomCenterY * scale;

    log.info('addCameraTween.zoom', 'building', {
      zg,
      scale,
      translateX,
      translateY,
      easeTimeS,
      durationS,
    });

    // Quality nudge: drop `will-change: transform` AFTER ease-in so the browser
    // MAY re-rasterize the spread layer at the zoomed size (Chrome/Edge often do;
    // Safari less so). `will-change` locks the layer at base resolution → blur on
    // GPU upscale. Re-arm `will-change` BEFORE revert so the unzoom tween stays
    // smooth. Player-canvas sets the initial `will-change: transform`.
    const easeInTween = tl.to(
      spreadEl,
      {
        scale,
        x: translateX,
        y: translateY,
        duration: easeTimeS,
        delay: delayS,
        ease: CAMERA_DEFAULTS.EASE,
        onStart: options?.onStart,
        onComplete: () => {
          spreadEl.style.willChange = 'auto';
        },
      },
      position,
    );
    void easeInTween;
    tl.set(
      spreadEl,
      {
        scale: 1,
        x: 0,
        y: 0,
        onStart: () => {
          spreadEl.style.willChange = 'transform';
        },
        onComplete: options?.onComplete,
      },
      `>+=${holdS}`,
    );
  }
}

export function applyCameraEndState(
  anim: SpreadAnimation,
  spreadEl: HTMLElement | null,
  resolvedTargetId?: string,
): void {
  if (!spreadEl) return;
  if (anim.effect.type === 18) {
    const targetId = resolvedTargetId ?? anim.target.id;
    const siblings = getVisualSiblings(spreadEl, new Set([targetId]));
    const visualEls = mapToVisualChildren(siblings);
    if (visualEls.length === 0) return;
    gsap.set(visualEls, { filter: 'none' });
  } else if (anim.effect.type === 19) {
    gsap.set(spreadEl, {
      scale: 1,
      x: 0,
      y: 0,
      transformOrigin: CAMERA_DEFAULTS.ZOOM_TRANSFORM_ORIGIN,
    });
    // Restore `will-change` in case scrub/skip happened during the dropped window
    spreadEl.style.willChange = 'transform';
  }
}
