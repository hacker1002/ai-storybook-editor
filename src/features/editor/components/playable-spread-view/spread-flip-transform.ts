// spread-flip-transform.ts — Pure page-turn flip math + styling constants.
//
// Single source of truth shared between the LIVE player (GSAP wall-clock driver,
// `use-spread-turn-transition.ts`) and the RENDER side (Remotion frame driver,
// book-video composition — phase 02). MUST stay free of GSAP / Remotion / `@/`
// runtime deps so the render Node bundle can import it directly.
//
// Design: service/video-worker/07-spread-transition-render.md §2 (formula + constants).

/** Direction of the page turn (relative to the spread sequence). */
export type TurnDirection = 'next' | 'prev';

/**
 * Layout context captured once per turn. Pivot is the gutter in every case —
 * map kept (not a constant) so callers can read by layout key.
 */
export type TurnLayout = 'spread' | 'single-left' | 'single-right';

/**
 * Result of `computeFlipTransform`. `rotateY_deg` goes on the flipping card,
 * `perspective_px` on the parent positioner, `frontOpacity`/`backOpacity` are a
 * hard 1/0 swap at the midpoint (progress = 0.5).
 */
export interface FlipTransform {
  rotateY_deg: number;
  transformOrigin: string;
  frontOpacity: number;
  backOpacity: number;
  perspective_px: number;
}

// ── Constants (moved from transition/spread-turn-constants.ts — single source) ──

/** Default total turn duration in milliseconds (player wall-clock). Render uses
 *  TRANSITION_SEC=0.9 (06 §3) — same 900ms. Half-flips at duration/2. */
export const DEFAULT_TURN_DURATION_MS = 900;

/** `perspective` applied to the overlay/positioner parent so the 3D rotation of
 *  the front/back faces is evaluated in a proper perspective context. */
export const PERSPECTIVE_PX = 1200;

/** Cream-paper background color used for the back face (design §2.2). */
export const PAPER_BG_COLOR = '#f4ecd8';

/** Inset shadow recipe applied to the back face — emulates page thickness/curl. */
export const PAPER_INNER_SHADOW = 'inset 0 0 30px rgba(0,0,0,0.15)';

/** Pivot origin for the flipping card. Always at the gutter (50% 50% of the full
 *  spread container) regardless of fullPageMode (the outer clip-wrapper hides one
 *  half but the gutter stays at 50% of the overlay). Map kept so callers / overlay
 *  can read by layout key. */
export const LAYOUT_PIVOT_MAP: Record<TurnLayout, string> = {
  spread: '50% 50%',
  'single-left': '50% 50%',
  'single-right': '50% 50%',
};

// ── Page-turn clip-path geometry (shared by render; mirrors the live overlay) ───

/** Right-half clip — keeps the right page, clips the left. */
const CLIP_RIGHT_HALF = 'inset(0 0 0 50%)';
/** Left-half clip — keeps the left page, clips the right. */
const CLIP_LEFT_HALF = 'inset(0 50% 0 0)';

/** The three clip-paths a spread page-turn needs (single source for the half-page
 *  geometry the live `spread-turn-overlay` hardcodes inline — see its §3.5 comment). */
export interface TurnClips {
  /** Pinned non-flipping half (StaticLayer). */
  staticClip: string;
  /** The lifting half on the flip card's FRONT face. */
  frontClip: string;
  /** Incoming half on the flip card's BACK face — the INVERSE half of `frontClip`.
   *  With the back's own `rotateY(180)` composed with the card's parent rotation
   *  (pivots coincide at 50% 50%), the net orientation is identity, so the back
   *  content lands on the INCOMING half rather than snapping back to the outgoing
   *  half. `staticClip` always pins that same incoming half. */
  backClip: string;
}

/**
 * Resolve the page-turn clip set for a direction. `next` = the right page lifts and
 * folds left over the spine; `prev` mirrors it. Values are byte-identical to the
 * overlay's `flippingClip`/`backFlippingClip`/`staticClip` so render === live geometry.
 */
export function resolveTurnClips(direction: TurnDirection): TurnClips {
  return direction === 'next'
    ? { frontClip: CLIP_RIGHT_HALF, backClip: CLIP_LEFT_HALF, staticClip: CLIP_LEFT_HALF }
    : { frontClip: CLIP_LEFT_HALF, backClip: CLIP_RIGHT_HALF, staticClip: CLIP_RIGHT_HALF };
}

/**
 * Compute the flip transform at a given normalized progress.
 *
 * Bakes the GSAP `power2` easing the live player previously applied as two
 * separate tween easings:
 *   - PHASE 1 (front fold, 0 → ±90°): `power2.in`  → t²
 *   - PHASE 2 (back reveal, ±90 → ±180°): `power2.out` → 1 - (1 - t)²
 *
 * Face-swap is a HARD opacity switch at progress = 0.5 (mirrors the player's
 * old `.call(swapPointHandler)` at the edge-on midpoint).
 *
 * `next` rotates 0 → -180°, `prev` rotates 0 → +180°.
 *
 * @param progress 0..1 across the whole flip. Clamped defensively.
 */
export function computeFlipTransform(
  progress: number,
  direction: TurnDirection,
  layout: TurnLayout,
): FlipTransform {
  const p = progress < 0 ? 0 : progress > 1 ? 1 : progress;
  const sign = direction === 'next' ? -1 : 1;
  const transformOrigin = LAYOUT_PIVOT_MAP[layout];

  let rotateY_deg: number;
  let frontOpacity: number;
  let backOpacity: number;

  if (p < 0.5) {
    // PHASE 1 — front fold: 0 → ±90° with power2.in (t²).
    const p1 = p * 2;
    rotateY_deg = sign * 90 * (p1 * p1);
    frontOpacity = 1;
    backOpacity = 0;
  } else {
    // PHASE 2 — back reveal: ±90° → ±180° with power2.out (1 - (1 - t)²).
    const p2 = (p - 0.5) * 2;
    const eased = 1 - (1 - p2) * (1 - p2);
    rotateY_deg = sign * (90 + 90 * eased);
    frontOpacity = 0;
    backOpacity = 1;
  }

  return {
    rotateY_deg,
    transformOrigin,
    frontOpacity,
    backOpacity,
    perspective_px: PERSPECTIVE_PX,
  };
}
