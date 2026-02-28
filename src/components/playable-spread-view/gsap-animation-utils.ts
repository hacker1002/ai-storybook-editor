// gsap-animation-utils.ts - GSAP animation utility functions for PlayableSpreadView

import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import type { Animation } from './types';

// Register MotionPathPlugin (expected to be registered in app entry)
gsap.registerPlugin(MotionPathPlugin);

type TriggerType = 'on_click' | 'with_previous' | 'after_previous';
type Direction = 'left' | 'right' | 'up' | 'down';

interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Map trigger type to GSAP timeline position parameter
 * @param triggerType - Animation trigger type
 * @returns GSAP position string ('<' for with_previous, '>' for after/on_click)
 */
export function getTimelinePosition(triggerType: TriggerType): string {
  switch (triggerType) {
    case 'with_previous':
      return '<';
    case 'after_previous':
      return '>';
    case 'on_click':
      return '>'; // Treat as after_previous in player
    default:
      return '>';
  }
}

/**
 * Get offset coordinates for directional animations (Fly In/Out)
 * @param direction - Direction to fly from/to
 * @returns Object with x and y offset strings (percentage-based)
 */
export function getDirectionOffset(direction?: Direction): { x: string; y: string } {
  switch (direction) {
    case 'left':
      return { x: '-100%', y: '0' };
    case 'right':
      return { x: '100%', y: '0' };
    case 'up':
      return { x: '0', y: '-100%' };
    case 'down':
      return { x: '0', y: '100%' };
    default:
      return { x: '0', y: '0' };
  }
}

/**
 * Get appropriate easing function for effect type
 * @param effectType - Effect type number (1-17)
 * @returns GSAP ease string
 */
export function getEaseFunction(effectType: number): string {
  // Entrance effects (2-6)
  if ([2, 3, 4, 5, 6].includes(effectType)) {
    return 'power2.out';
  }

  // Exit effects (12-15)
  if ([12, 13, 14, 15].includes(effectType)) {
    return 'power2.in';
  }

  // Teeter (9) - specific ease
  if (effectType === 9) {
    return 'sine.inOut';
  }

  // Emphasis effects (7, 8, 10)
  if ([7, 8, 10].includes(effectType)) {
    return 'power1.inOut';
  }

  // Default
  return 'power2.out';
}

/**
 * Convert geometry object to SVG path string for motionPath
 * @param geometry - Geometry object with x, y coordinates
 * @returns SVG path string (linear from origin to target)
 */
function geometryToPath(geometry: Geometry): string {
  return `M 0 0 L ${geometry.x} ${geometry.y}`;
}

/**
 * Build GSAP tween/timeline for an animation
 * @param el - Target HTML element
 * @param anim - Animation configuration
 * @param prefersReducedMotion - Accessibility flag to disable animations
 * @returns GSAP Tween or Timeline
 */
export function buildAnimationTween(
  el: HTMLElement,
  anim: Animation,
  prefersReducedMotion: boolean = false
): gsap.core.Tween | gsap.core.Timeline {
  const effect = anim.effect;
  const duration = prefersReducedMotion ? 0 : (effect.duration || 500) / 1000;
  const delay = (effect.delay || 0) / 1000;
  const ease = getEaseFunction(effect.type);

  switch (effect.type) {
    // === MEDIA (1) ===
    case 1: // Play
      {
        const tl = gsap.timeline();
        tl.call(() => {
          if (el instanceof HTMLAudioElement || el instanceof HTMLVideoElement) {
            el.currentTime = 0;
            el.play().catch((err) => {
              console.warn('Media play failed:', err);
            });
          }
        });
        return tl;
      }

    // === ENTRANCE (2-6) ===
    case 2: // Appear
      return gsap.set(el, { autoAlpha: 1, delay });

    case 3: // Fade In
      return gsap.to(el, { autoAlpha: 1, duration, delay, ease });

    case 4: // Fly In
      {
        const offset = getDirectionOffset(effect.direction);
        return gsap.from(el, {
          x: offset.x,
          y: offset.y,
          autoAlpha: 0,
          duration,
          delay,
          ease,
        });
      }

    case 5: // Float In
      return gsap.from(el, {
        y: '20%',
        autoAlpha: 0,
        duration,
        delay,
        ease: 'power2.out',
      });

    case 6: // Zoom
      return gsap.from(el, {
        scale: 0,
        autoAlpha: 0,
        duration,
        delay,
        ease,
      });

    // === EMPHASIS (7-11) ===
    case 7: // Spin
      {
        const amount = effect.amount || 1;
        const repeat = effect.loop === -1 ? -1 : effect.loop || 0;
        return gsap.to(el, {
          rotation: 360 * amount,
          duration,
          delay,
          ease,
          repeat,
        });
      }

    case 8: // Grow/Shrink
      return gsap.to(el, {
        scale: effect.amount || 1.2,
        duration,
        delay,
        ease,
      });

    case 9: // Teeter
      {
        const repeat = effect.loop === -1 ? -1 : effect.loop || 4;
        return gsap.to(el, {
          rotation: 5,
          duration: duration / 2,
          delay,
          ease: 'sine.inOut',
          yoyo: true,
          repeat,
        });
      }

    case 10: // Transparency
      return gsap.to(el, {
        autoAlpha: 0.5,
        duration,
        delay,
        ease,
      });

    case 11: // Read-along
      // STUB: Return empty timeline - requires textbox refactor with [data-word] spans
      console.warn(
        'Read-along animation (type 11) not implemented - requires [data-word] spans'
      );
      return gsap.timeline();

    // === EXIT (12-15) ===
    case 12: // Disappear
      return gsap.set(el, { autoAlpha: 0, delay });

    case 13: // Fade Out
      return gsap.to(el, { autoAlpha: 0, duration, delay, ease });

    case 14: // Fly Out
      {
        const offset = getDirectionOffset(effect.direction);
        return gsap.to(el, {
          x: offset.x,
          y: offset.y,
          autoAlpha: 0,
          duration,
          delay,
          ease,
        });
      }

    case 15: // Float Out
      return gsap.to(el, {
        y: '20%',
        autoAlpha: 0,
        duration,
        delay,
        ease: 'power2.in',
      });

    // === MOTION PATH (16-17) ===
    case 16: // Lines
      if (!effect.geometry) {
        console.warn('Lines animation (type 16) missing geometry data');
        return gsap.set(el, {});
      }
      return gsap.to(el, {
        motionPath: {
          path: geometryToPath(effect.geometry),
        },
        duration,
        delay,
        ease,
      });

    case 17: // Arcs
      if (!effect.geometry) {
        console.warn('Arcs animation (type 17) missing geometry data');
        return gsap.set(el, {});
      }
      return gsap.to(el, {
        motionPath: {
          path: geometryToPath(effect.geometry),
          curviness: 1.5,
        },
        duration,
        delay,
        ease,
      });

    default:
      console.warn(`Unknown effect type: ${effect.type}`);
      return gsap.set(el, {}); // No-op
  }
}

/**
 * Reset all GSAP-applied inline styles on elements
 * @param elements - Array of HTML elements to reset
 */
export function resetElementStyles(elements: HTMLElement[]): void {
  gsap.set(elements, { clearProps: 'all' });
}

// Entrance effect types that require elements to start hidden
const ENTRANCE_EFFECT_TYPES = [3, 4, 5, 6]; // Fade In, Fly In, Float In, Zoom

/**
 * Check if effect type is an entrance animation
 */
export function isEntranceEffect(effectType: number): boolean {
  return ENTRANCE_EFFECT_TYPES.includes(effectType);
}

/**
 * Set initial states for elements based on their first animation
 * Elements with entrance animations start hidden (autoAlpha: 0)
 * This prevents the flash when gsap.from() runs
 */
export function setInitialStates(
  elementRefsMap: Map<string, HTMLElement>,
  animations: Animation[]
): void {
  // Group animations by target to find first animation for each element
  const firstAnimByTarget = new Map<string, Animation>();

  // Sort by order and get first animation per target
  const sorted = [...animations].sort((a, b) => a.order - b.order);
  for (const anim of sorted) {
    if (!firstAnimByTarget.has(anim.target.id)) {
      firstAnimByTarget.set(anim.target.id, anim);
    }
  }

  // Set initial state based on first animation type
  firstAnimByTarget.forEach((anim, targetId) => {
    const el = elementRefsMap.get(targetId);
    if (!el) return;

    if (isEntranceEffect(anim.effect.type)) {
      // Entrance effects: start hidden
      gsap.set(el, { autoAlpha: 0 });
    }
    // Other effects: leave element visible (default state)
  });
}
