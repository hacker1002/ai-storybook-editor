// player-initial-states.ts - Pre-playback initial state setup and reset utilities for GSAP

import gsap from 'gsap';
import type { SpreadAnimation } from '@/types/spread-types';
import { CANVAS } from '@/constants/spread-constants';
import { EFFECT_TYPE } from '@/constants/playable-constants';

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

// === Resolve Initial State ===

/** Determine GSAP initial props for a single animation based on its effect type */
export function resolveInitialState(
  animation: SpreadAnimation,
  spreadContainer: HTMLElement | null
): gsap.TweenVars {
  const { type } = animation.effect;
  const cw = spreadContainer?.getBoundingClientRect().width ?? CANVAS.BASE_WIDTH;
  const ch = spreadContainer?.getBoundingClientRect().height ?? CANVAS.BASE_HEIGHT;

  switch (type) {
    // Media Play — handled separately (pause + currentTime=0)
    case EFFECT_TYPE.PLAY:
      return {};

    // Entrance: hidden
    case EFFECT_TYPE.APPEAR:
    case EFFECT_TYPE.FADE_IN:
      return { autoAlpha: 0 };

    case EFFECT_TYPE.FLY_IN: {
      const offset = calculateFlyOffset(animation.effect.direction, cw, ch);
      return { autoAlpha: 0, x: offset.x, y: offset.y };
    }

    case EFFECT_TYPE.FLOAT_IN: {
      const offset = calculateFloatOffset(animation.effect.direction);
      return { autoAlpha: 0, x: offset.x, y: offset.y };
    }

    case EFFECT_TYPE.ZOOM:
      return { autoAlpha: 0, scale: 0, transformOrigin: 'center center' };

    // Emphasis, Exit, Motion: visible at origin
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
      return { autoAlpha: 1 };

    default:
      return { autoAlpha: 1 };
  }
}

// === Resolve Animation End State (for USER_BACK re-apply) ===

/** Determine GSAP final props after animation completes */
export function resolveAnimationEndState(
  animation: SpreadAnimation,
  spreadContainer: HTMLElement | null,
  itemGeometry?: { x: number; y: number }
): gsap.TweenVars {
  const { type, amount, direction } = animation.effect;
  const cw = spreadContainer?.getBoundingClientRect().width ?? CANVAS.BASE_WIDTH;
  const ch = spreadContainer?.getBoundingClientRect().height ?? CANVAS.BASE_HEIGHT;

  switch (type) {
    case EFFECT_TYPE.PLAY:
    case EFFECT_TYPE.READ_ALONG:
      return {};

    case EFFECT_TYPE.APPEAR:
    case EFFECT_TYPE.FADE_IN:
    case EFFECT_TYPE.FLOAT_IN:
      return { autoAlpha: 1, x: 0, y: 0 };

    case EFFECT_TYPE.FLY_IN:
      return { autoAlpha: 1, x: 0, y: 0 };

    case EFFECT_TYPE.ZOOM:
      return { autoAlpha: 1, x: 0, y: 0, scale: amount ?? 1, transformOrigin: 'center center' };

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

    default:
      return {};
  }
}

// === Reset & Apply ===

/** Remove all GSAP inline styles and read-along highlights from elements in the refs map */
export function resetElementStyles(elementRefsMap: Map<string, HTMLElement>): void {
  elementRefsMap.forEach((element) => {
    gsap.set(element, { clearProps: 'opacity,visibility,transform,transformOrigin' });
    // Clear read-along word highlights (CSS class on child spans)
    element.querySelectorAll('.read-along-active-word').forEach((el) => {
      el.classList.remove('read-along-active-word');
    });
  });
}

/**
 * Apply initial GSAP states to all animated items before playback.
 * Groups animations by target, uses the first animation (lowest order) to determine initial state.
 */
export function applyInitialStates(
  animations: SpreadAnimation[],
  elementRefsMap: Map<string, HTMLElement>,
  spreadContainer: HTMLElement | null
): void {
  if (!animations || animations.length === 0) return;

  // Group by target.id, pick animation with lowest order per target
  const firstAnimByTarget = new Map<string, SpreadAnimation>();
  const sorted = [...animations].sort((a, b) => a.order - b.order);

  for (const anim of sorted) {
    const tid = anim.target.id;
    if (!firstAnimByTarget.has(tid)) {
      firstAnimByTarget.set(tid, anim);
    }
  }

  // Apply initial state per target
  firstAnimByTarget.forEach((anim, targetId) => {
    const element = elementRefsMap.get(targetId);
    if (!element) return;

    const initialProps = resolveInitialState(anim, spreadContainer);
    if (Object.keys(initialProps).length > 0) {
      gsap.set(element, initialProps);
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
}
