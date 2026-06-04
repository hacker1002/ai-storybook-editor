// player-initial-states.ts - Pre-playback initial state setup and reset utilities for GSAP

import gsap from 'gsap';
import type { BaseSpread, SpreadAnimation } from '@/types/spread-types';
import type { CanvasSize } from '@/types/canvas-types';
import type { PlayEdition } from '@/types/playable-types';
import { CAMERA_DEFAULTS, EFFECT_TYPE } from '@/constants/playable-constants';
import { resolveAnimationTarget } from '@/features/editor/utils/composite-resolve-helpers';
import { restoreBaseRotation } from './restore-base-rotation';

// === Base Opacity ===

/**
 * Read element's base opacity from data attribute (set by React, unaffected by GSAP).
 * Used to preserve fill.opacity on shapes when GSAP autoAlpha would override it.
 */
export function getBaseOpacity(element: HTMLElement): number {
  return parseFloat(element.dataset.baseOpacity ?? '') || 1;
}

// === Offset Helpers ===

interface Offset {
  x: number;
  y: number;
}

/** Calculate offscreen offset for Fly In/Out based on direction */
export function calculateFlyOffset(
  direction: string | undefined,
  containerWidth: number,
  containerHeight: number
): Offset {
  switch (direction) {
    case 'right':  return { x: containerWidth, y: 0 };
    case 'up':     return { x: 0, y: -containerHeight };
    case 'down':   return { x: 0, y: containerHeight };
    case 'left':
    default:       return { x: -containerWidth, y: 0 };
  }
}

/** Calculate soft offset for Float In/Out (50px) */
export function calculateFloatOffset(direction: string | undefined): Offset {
  switch (direction) {
    case 'left':   return { x: -50, y: 0 };
    case 'right':  return { x: 50, y: 0 };
    case 'up':     return { x: 0, y: -50 };
    case 'down':
    default:       return { x: 0, y: 50 };
  }
}

/**
 * Resolve container dimensions for offset math. Prefers the live measured rect,
 * but a measured value of 0 is treated as "unmeasured" and falls back to the
 * explicit canvasSize (and finally a hard default). Critical for headless
 * Remotion render: `useLayoutEffect` can fire before the AbsoluteFill resolves
 * its inset:0 size, so getBoundingClientRect() returns 0 — `?? canvasSize` does
 * NOT catch that (0 isn't nullish), which collapsed FLY_IN/OUT offsets to 0 and
 * made items "pop in" instead of flying. Live player measures >0 ⇒ unchanged.
 */
function resolveContainerDims(
  spreadContainer: HTMLElement | null,
  canvasSize?: CanvasSize,
): { cw: number; ch: number } {
  const rect = spreadContainer?.getBoundingClientRect();
  const measuredW = rect?.width ?? 0;
  const measuredH = rect?.height ?? 0;
  return {
    cw: measuredW > 0 ? measuredW : (canvasSize?.width ?? 800),
    ch: measuredH > 0 ? measuredH : (canvasSize?.height ?? 600),
  };
}

// === Resolve Initial State ===

/**
 * Determine GSAP initial props for a single animation based on its effect type.
 * @param baseOpacity - Element's natural CSS opacity (from data-base-opacity). Defaults to 1.
 *   Used for "visible" states so GSAP doesn't override e.g. shape fill.opacity.
 */
export function resolveInitialState(
  animation: SpreadAnimation,
  spreadContainer: HTMLElement | null,
  canvasSize?: CanvasSize,
  baseOpacity: number = 1
): gsap.TweenVars {
  const { type } = animation.effect;
  const { cw, ch } = resolveContainerDims(spreadContainer, canvasSize);

  switch (type) {
    // Media Play — handled separately (pause + currentTime=0)
    case EFFECT_TYPE.PLAY:
      return {};

    // Entrance: hidden
    case EFFECT_TYPE.APPEAR:
    case EFFECT_TYPE.FADE_IN:
      return { autoAlpha: 0 };

    case EFFECT_TYPE.FLY_IN: {
      // Negate: 'direction' = direction of travel (left = travels leftward = starts offscreen right)
      const offset = calculateFlyOffset(animation.effect.direction, cw, ch);
      return { autoAlpha: 0, x: -offset.x, y: -offset.y };
    }

    case EFFECT_TYPE.FLOAT_IN: {
      // Negate: same semantic — direction = direction of travel
      const offset = calculateFloatOffset(animation.effect.direction);
      return { autoAlpha: 0, x: -offset.x, y: -offset.y };
    }

    case EFFECT_TYPE.ZOOM:
      return { autoAlpha: 0, scale: 0, transformOrigin: 'center center' };

    // Emphasis, Exit, Motion: visible at element's natural opacity
    case EFFECT_TYPE.SPIN:
    case EFFECT_TYPE.GROW_SHRINK:
    case EFFECT_TYPE.TEETER:
    case EFFECT_TYPE.TRANSPARENCY:
    case EFFECT_TYPE.READ_ALONG:
    case EFFECT_TYPE.DISAPPEAR:
    case EFFECT_TYPE.FADE_OUT:
    case EFFECT_TYPE.FLY_OUT:
    case EFFECT_TYPE.FLOAT_OUT:
    case EFFECT_TYPE.LINES:
    case EFFECT_TYPE.ARCS:
      return { autoAlpha: baseOpacity };

    // Camera (Focus, Zoom In) — no per-item state; spread-level reset applied in post-loop block
    case EFFECT_TYPE.FOCUS:
    case EFFECT_TYPE.ZOOM_IN:
      return {};

    default:
      return { autoAlpha: baseOpacity };
  }
}

// === Resolve Animation End State (for USER_BACK re-apply) ===

/**
 * Determine GSAP final props after animation completes.
 * @param baseOpacity - Element's natural CSS opacity (from data-base-opacity). Defaults to 1.
 *   Entrance end states use this so the element returns to its natural opacity, not forced to 1.
 */
export function resolveAnimationEndState(
  animation: SpreadAnimation,
  spreadContainer: HTMLElement | null,
  itemGeometry?: { x: number; y: number },
  canvasSize?: CanvasSize,
  baseOpacity: number = 1
): gsap.TweenVars {
  const { type, amount, direction } = animation.effect;
  const { cw, ch } = resolveContainerDims(spreadContainer, canvasSize);

  switch (type) {
    case EFFECT_TYPE.PLAY:
    case EFFECT_TYPE.READ_ALONG:
      return {};

    case EFFECT_TYPE.APPEAR:
    case EFFECT_TYPE.FADE_IN:
    case EFFECT_TYPE.FLOAT_IN:
      return { autoAlpha: baseOpacity, x: 0, y: 0 };

    case EFFECT_TYPE.FLY_IN:
      return { autoAlpha: baseOpacity, x: 0, y: 0 };

    case EFFECT_TYPE.ZOOM:
      return { autoAlpha: baseOpacity, x: 0, y: 0, scale: amount ?? 1, transformOrigin: 'center center' };

    case EFFECT_TYPE.SPIN: {
      const rotations = amount ?? 1;
      const deg = direction === 'right' ? -(360 * rotations) : 360 * rotations;
      return { rotation: deg, transformOrigin: 'center center' };
    }

    case EFFECT_TYPE.GROW_SHRINK: {
      const a = amount ?? 1.2;
      let scaleX = a;
      let scaleY = a;
      if (direction === 'left' || direction === 'right') { scaleY = 1; }
      if (direction === 'up' || direction === 'down') { scaleX = 1; }
      return { scaleX, scaleY, transformOrigin: 'center center' };
    }

    case EFFECT_TYPE.TEETER:
      return { rotation: 0, transformOrigin: 'center bottom' };

    case EFFECT_TYPE.TRANSPARENCY:
      return { autoAlpha: amount ?? 0.5 };

    case EFFECT_TYPE.DISAPPEAR:
    case EFFECT_TYPE.FADE_OUT:
      return { autoAlpha: 0 };

    case EFFECT_TYPE.FLY_OUT: {
      const offset = calculateFlyOffset(direction, cw, ch);
      return { autoAlpha: 0, x: offset.x, y: offset.y };
    }

    case EFFECT_TYPE.FLOAT_OUT: {
      const offset = calculateFloatOffset(direction);
      return { autoAlpha: 0, x: offset.x, y: offset.y };
    }

    case EFFECT_TYPE.LINES:
    case EFFECT_TYPE.ARCS: {
      const geo = animation.effect.geometry;
      if (!geo) return {};
      // effect.geometry = absolute target position (%), delta = target - item origin
      const deltaX = itemGeometry ? ((geo.x - itemGeometry.x) / 100) * cw : (geo.x / 100) * cw;
      const deltaY = itemGeometry ? ((geo.y - itemGeometry.y) / 100) * ch : (geo.y / 100) * ch;
      return { x: deltaX, y: deltaY };
    }

    // Camera animations auto-revert — caller must use applyCameraEndState helper instead.
    case EFFECT_TYPE.FOCUS:
    case EFFECT_TYPE.ZOOM_IN:
      return {};

    default:
      return {};
  }
}

// === Reset & Apply ===

/** Remove all GSAP inline styles and read-along highlights from elements in the refs map */
export function resetElementStyles(elementRefsMap: Map<string, HTMLElement>): void {
  elementRefsMap.forEach((element) => {
    gsap.set(element, { clearProps: 'opacity,visibility,transform,transformOrigin' });
    // clearProps wipes the React-applied `transform: rotate(...)` and React
    // doesn't re-render. Re-establish the static geometry rotation via GSAP so
    // animations compose with it instead of starting from 0deg.
    restoreBaseRotation(element);
    // clearProps removes ALL inline opacity — restore base opacity for elements that have it
    // (e.g. shapes with fill.opacity). Without this, non-animated items lose their CSS opacity.
    const bo = getBaseOpacity(element);
    if (bo < 1) {
      element.style.opacity = String(bo);
    }
    // Clear read-along word highlights (CSS class on child spans)
    element.querySelectorAll('.read-along-active-word').forEach((el) => {
      el.classList.remove('read-along-active-word');
    });
  });
}

/**
 * Apply initial GSAP states to all animated items before playback.
 * Groups animations by RESOLVED target (variant id for composite targets),
 * uses the first animation (lowest order) to determine initial state.
 *
 * Composite-aware: when `target.type === 'composite'`, the actual element is
 * registered under the active variant id (resolved via `playEdition`), not the
 * composite id. Without resolution, entrance animations (FLY_IN/FLOAT_IN/ZOOM)
 * silently no-op and elements "pop in" at the start instead of starting from
 * the offscreen anchor.
 *
 * @param spread Optional — required for composite target resolution. Pass undefined for legacy callers.
 * @param playEdition Optional — required for composite target resolution. Defaults to 'dynamic'.
 */
export function applyInitialStates(
  animations: SpreadAnimation[],
  elementRefsMap: Map<string, HTMLElement>,
  spreadContainer: HTMLElement | null,
  canvasSize?: CanvasSize,
  spread?: Pick<BaseSpread, 'composites'>,
  playEdition: PlayEdition = 'dynamic',
): void {
  if (!animations || animations.length === 0) return;

  // Group by RESOLVED target id (variant id when composite), pick animation with lowest order per target.
  // Map value carries both anim + resolved id so the second pass doesn't repeat resolution.
  const firstAnimByTarget = new Map<string, { anim: SpreadAnimation; bypassMotion: boolean }>();
  const sorted = [...animations].sort((a, b) => a.order - b.order);

  for (const anim of sorted) {
    // Resolve composite targets to active variant id. For non-composite targets,
    // resolveAnimationTarget passes through unchanged (variantId === target.id).
    // When `spread` is undefined (legacy callers) we fall back to raw target.id —
    // composite resolution simply does not happen, matching pre-Phase-6 behavior.
    let resolvedId = anim.target.id;
    let bypassMotion = false;
    if (spread && anim.target.type === 'composite') {
      const r = resolveAnimationTarget(anim.target, spread, playEdition);
      if (!r.variantId) continue; // composite has no slot for this edition → skip
      resolvedId = r.variantId;
      bypassMotion = r.bypassMotion;
    }
    if (!firstAnimByTarget.has(resolvedId)) {
      firstAnimByTarget.set(resolvedId, { anim, bypassMotion });
    }
  }

  // Apply initial state per resolved target
  firstAnimByTarget.forEach(({ anim, bypassMotion }, targetId) => {
    const element = elementRefsMap.get(targetId);
    if (!element) return;

    // Classic edition / bypassMotion: tween builder skips motion and writes
    // final state directly — setting an entrance "hidden" initial state would
    // hide the element forever. Skip initial-state assignment for that branch.
    if (!bypassMotion) {
      const initialProps = resolveInitialState(anim, spreadContainer, canvasSize, getBaseOpacity(element));
      if (Object.keys(initialProps).length > 0) {
        gsap.set(element, initialProps);
      }
    }

    // Special: media play — pause + reset
    if (anim.effect.type === EFFECT_TYPE.PLAY) {
      const mediaEl = element.querySelector('audio, video') as HTMLMediaElement | null;
      if (mediaEl) {
        mediaEl.pause();
        mediaEl.currentTime = 0;
      }
    }

    // Always clear read-along highlighted word classes (not just for READ_ALONG first-anim targets,
    // because a textbox may have READ_ALONG as a later animation, and highlights must be reset)
    element.querySelectorAll('.read-along-active-word').forEach((el) => {
      el.classList.remove('read-along-active-word');
    });
    // Remove orphaned dynamically-created read-along audio elements (display:none, direct child)
    element.querySelectorAll(':scope > audio[style*="display: none"]').forEach((el) => {
      (el as HTMLAudioElement).pause();
      el.remove();
    });
  });

  // Camera defensive reset — covers prior-step transforms/filter/opacity that auto-revert may have missed.
  const hasCamera = animations.some(
    (a) => a.effect.type === EFFECT_TYPE.FOCUS || a.effect.type === EFFECT_TYPE.ZOOM_IN,
  );
  if (hasCamera && spreadContainer) {
    gsap.set(spreadContainer, {
      scale: 1,
      x: 0,
      y: 0,
      transformOrigin: CAMERA_DEFAULTS.ZOOM_TRANSFORM_ORIGIN,
    });
    const allVisualItems = spreadContainer.querySelectorAll<HTMLElement>('[data-item-id]');
    if (allVisualItems.length > 0) {
      gsap.set(allVisualItems, { filter: 'none', opacity: 1 });
    }
  }
}
