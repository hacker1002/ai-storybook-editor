// spread-turn-types.ts - Shared TypeScript contract for the spread turn-page transition.
// Consumed by `useSpreadTurnTransition` hook (Phase 5), `SpreadTurnOverlay` (Phase 4),
// and the `PlayableSpreadView` caller (Phase 6). Single source of truth — keep types
// aligned with spec `03-12-spread-turn-transition.md` §2 / §5.

/** Direction of the page turn (relative to the spread sequence). */
export type TurnDirection = 'next' | 'prev';

/** Lifecycle phase of a single turn. Spec §2.2. */
export type TurnPhase = 'idle' | 'flipping' | 'swapping' | 'settling';

/** Layout context at the moment startTurn() is invoked. Captured once per turn —
 *  do NOT re-evaluate inside the timeline (spec §3 pivot strategy).
 *  - `spread`       → 2-page layout (desktop / landscape share-preview); pivot at gutter.
 *  - `single-left`  → portrait full-page mode showing only the left page; pivot on right edge
 *                     (right edge = the spine side of a left page).
 *  - `single-right` → portrait full-page mode showing only the right page; pivot on left edge
 *                     (left edge = the spine side of a right page). */
export type TurnLayout = 'spread' | 'single-left' | 'single-right';

/** Live state for the turn state machine — kept in `PlayableSpreadView`. */
export interface TurnState {
  phase: TurnPhase;
  direction: TurnDirection | null;
  /** Layout snapshot captured at startTurn time (driven by fullPageMode). */
  layout: TurnLayout | null;
  fromSpreadId: string | null;
  toSpreadId: string | null;
  /** `performance.now()` timestamp when the turn started — used for debug/timing logs. */
  startedAt: number;
  /** At most one queued turn while a turn is mid-flight. Newer requests overwrite older. */
  queuedTurn: StartTurnParams | null;
}

/** Snapshot of the current spread DOM, taken just before the turn begins.
 *  Two clones for `spread` layout (StaticLayer + FlippingCard cannot share a node);
 *  one clone for single-* layouts (no static layer rendered). */
export interface TurnSnapshot {
  /** Static layer clone — rendered behind the flipping card to keep the
   *  non-flipping half pinned to the outgoing visual until settle. `null` for
   *  single-* layouts where the entire page flips. */
  staticNode: HTMLElement | null;
  /** Flipping card front face clone — always present; rotated by GSAP. */
  flippingNode: HTMLElement;
  dimensions: { width: number; height: number };
  direction: TurnDirection;
  /** Determines pivot origin + clip-path matrix in the overlay. */
  layout: TurnLayout;
}

/** Input args for `startTurn()` — also used as the `queuedTurn` slot value. */
export interface StartTurnParams {
  fromSpreadId: string;
  toSpreadId: string;
  direction: TurnDirection;
}

/** Hook input — `PlayableSpreadView` provides these. */
export interface UseSpreadTurnTransitionParams {
  /** When false, hook is fully bypassed (caller falls back to instant swap). */
  enabled: boolean;
  /** Lazy DOM accessor — invoked at startTurn time, not at hook init. */
  spreadContainerGetter: () => HTMLElement | null;
  /** Caller swaps `selectedSpreadId` when this fires (mid-flip, at swap point). */
  onSwap: (toSpreadId: string) => void;
  /** Optional completion notifier — fires after rotateY tween settles. */
  onComplete?: () => void;
  /** Total turn duration in ms. Defaults to `DEFAULT_TURN_DURATION_MS` (600). */
  duration?: number;
}

/** Hook output — caller drives the lifecycle through this surface. */
export interface SpreadTurnTransitionAPI {
  startTurn: (params: StartTurnParams) => void;
  cancel: () => void;
  isActive: boolean;
  phase: TurnPhase;
}
