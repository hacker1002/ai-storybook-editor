// spread-turn-constants.ts - Static configuration for the spread-turn transition.
// Single source of truth for durations, paper styling, easing names, z-index,
// runtime debug flags, and the layout → pivot origin map. Imported by the hook,
// the overlay, and any caller that needs to override `duration` (spec §6 / §10).

import type { TurnLayout } from './spread-turn-types';

/** Default total turn duration in milliseconds (spec §6). Half-flips at duration/2. */
export const DEFAULT_TURN_DURATION_MS = 900;

/** Cream-paper background color used for the back face (spec §3.3). */
export const PAPER_BG_COLOR = '#f4ecd8';

/** Inset shadow recipe applied to the back face — emulates page thickness/curl. */
export const PAPER_INNER_SHADOW = 'inset 0 0 30px rgba(0,0,0,0.15)';

/** z-index of the portal overlay. Lives below `FirstGestureGate` (z-100) and
 *  above the thumbnail rail (spec §6 layered overlay structure). */
export const OVERLAY_Z_INDEX = 50;

/** Easing for the first half of the rotateY tween (0 → ±90°). */
export const EASE_HALF_FIRST = 'power2.in';

/** Easing for the second half of the rotateY tween (±90° → ±180°). */
export const EASE_HALF_SECOND = 'power2.out';

/** Single source of truth for the flipping card's pivot origin per layout
 *  (spec §3.4 / §3.6). Consumed by the overlay (CSS initial `transformOrigin`)
 *  and by the hook (`gsap.set` override at timeline build). Keep in sync — both
 *  must read from this map to avoid drift when adding a new layout. */
export const LAYOUT_PIVOT_MAP: Record<TurnLayout, string> = {
  spread: '50% 50%',
  'single-left': '100% 50%',
  'single-right': '0% 50%',
};

// ── Debug flags (read at startTurn time on `window`) ────────────────────────

/** `window.__TURN_DEBUG_SLOW = true` → multiply duration by 4× for inspection. */
export const DEBUG_SLOW_FLAG = '__TURN_DEBUG_SLOW';

/** `window.__TURN_DISABLE = true` → bypass the turn entirely (instant swap). */
export const DEBUG_DISABLE_FLAG = '__TURN_DISABLE';
