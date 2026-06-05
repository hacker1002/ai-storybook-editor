// spread-turn-constants.ts - Static configuration for the spread-turn transition.
// Single source of truth for durations, paper styling, easing names, z-index,
// runtime debug flags, and the layout → pivot origin map. Imported by the hook,
// the overlay, and any caller that needs to override `duration` (spec §6 / §10).

// Flip math + paper styling constants now live in the shared, runtime-dep-free
// `spread-flip-transform.ts` (single source — also imported by the Remotion render
// bundle in phase 02). Re-exported here to preserve this back-compat import path
// for the overlay + hook (design 07 §2.2).
export {
  DEFAULT_TURN_DURATION_MS,
  PAPER_BG_COLOR,
  PAPER_INNER_SHADOW,
  LAYOUT_PIVOT_MAP,
} from '../spread-flip-transform';

/** z-index of the portal overlay. Lives below `FirstGestureGate` (z-100) and
 *  above the thumbnail rail (spec §6 layered overlay structure). */
export const OVERLAY_Z_INDEX = 50;

/** Easing for the first half of the rotateY tween (0 → ±90°).
 *  @deprecated Easing is now baked into `computeFlipTransform`; kept for any
 *  legacy reference. The hook no longer drives GSAP eases directly. */
export const EASE_HALF_FIRST = 'power2.in';

/** Easing for the second half of the rotateY tween (±90° → ±180°).
 *  @deprecated See `EASE_HALF_FIRST`. */
export const EASE_HALF_SECOND = 'power2.out';

// ── Debug flags (read at startTurn time on `window`) ────────────────────────

/** `window.__TURN_DEBUG_SLOW = true` → multiply duration by 4× for inspection. */
export const DEBUG_SLOW_FLAG = '__TURN_DEBUG_SLOW';

/** `window.__TURN_DISABLE = true` → bypass the turn entirely (instant swap). */
export const DEBUG_DISABLE_FLAG = '__TURN_DISABLE';
