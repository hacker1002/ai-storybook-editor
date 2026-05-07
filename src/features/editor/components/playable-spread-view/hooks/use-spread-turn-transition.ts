// use-spread-turn-transition.ts - Spread turn-page transition orchestrator hook.
//
// State machine + GSAP timeline owner for the visual page-turn animation between
// two spreads. Caller (`PlayableSpreadView`) drives navigation through `startTurn`
// and is notified at the swap midpoint (so it can commit `selectedSpreadId`) plus
// at settle. Bypass paths fall through to immediate `onSwap()` so callers do not
// have to branch on transition state.
//
// Spec: ai-storybook-design/component/editor-page/shared/playable-spread-view/03-12-spread-turn-transition.md
// Phase 05 in plan: 260506-1416-spread-turn-transition-frontend.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { createLogger } from '@/utils/logger';
import { usePlaybackActions } from '@/stores/animation-playback-store';
import { takeSnapshot } from '../transition/spread-turn-snapshot';
import {
  DEFAULT_TURN_DURATION_MS,
  DEBUG_DISABLE_FLAG,
  DEBUG_SLOW_FLAG,
  EASE_HALF_FIRST,
  EASE_HALF_SECOND,
  LAYOUT_PIVOT_MAP,
} from '../transition/spread-turn-constants';
import type {
  StartTurnParams,
  TurnLayout,
  TurnSnapshot,
  TurnState,
  UseSpreadTurnTransitionParams,
} from '../transition/spread-turn-types';
import type { SpreadTurnOverlayProps } from '../transition/spread-turn-overlay';

const log = createLogger('Editor', 'useSpreadTurnTransition');

const INITIAL_STATE: TurnState = {
  phase: 'idle',
  direction: null,
  layout: null,
  fromSpreadId: null,
  toSpreadId: null,
  startedAt: 0,
  queuedTurn: null,
};

/** Bundle the visual artifacts captured at startTurn time. Held in state (not
 *  refs) so the overlay can read them during render without breaking the
 *  "no-ref-access-during-render" lint rule.
 *  - `snapshot` is captured BEFORE `onSwap` (OLD spread); used by FrontFace + StaticLayer.
 *  - `backNode` is captured 2 rAF AFTER `onSwap` so the underlying PlayerCanvas has
 *    rendered the NEW spread; mounted into BackFace so the user sees NEW content
 *    rotate in past midpoint. `null` until ready (paper fallback in overlay). */
interface TurnVisualState {
  snapshot: TurnSnapshot;
  containerRect: DOMRect;
  backNode: HTMLElement | null;
}

/** Re-evaluated on every `startTurn` — match-media changes mid-session are honored. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Read `window` debug flag without touching any global types. */
function readDebugFlag(name: string): boolean {
  try {
    return Boolean((window as unknown as Record<string, unknown>)[name]);
  } catch {
    return false;
  }
}

/** Extended hook return — adds `overlayProps` so caller can mount the overlay
 *  conditionally without prop drilling individual refs. */
export interface SpreadTurnTransitionHookAPI {
  startTurn: (params: StartTurnParams) => void;
  cancel: () => void;
  isActive: boolean;
  phase: TurnState['phase'];
  /** Non-null while the turn is in flight. Spread directly into `<SpreadTurnOverlay />`. */
  overlayProps: SpreadTurnOverlayProps | null;
}

export function useSpreadTurnTransition(
  params: UseSpreadTurnTransitionParams,
): SpreadTurnTransitionHookAPI {
  const { enabled, spreadContainerGetter, onSwap, onComplete, duration } = params;

  // === State ===
  // The phase / direction / layout / visual state drives re-renders; everything
  // mutating during the timeline (timelineRef, swappedRef, queuedTurnRef, dom
  // layer refs) lives in refs to avoid render storms.
  const [state, setState] = useState<TurnState>(INITIAL_STATE);
  const [visual, setVisual] = useState<TurnVisualState | null>(null);

  // === Refs ===
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const swappedRef = useRef<boolean>(false);
  /** Max one queued turn — newer requests overwrite older while in-flight. */
  const queuedTurnRef = useRef<StartTurnParams | null>(null);

  // Layer refs for the overlay (front face, back face, flipping card). The hook
  // owns these so it can drive GSAP transforms imperatively without the overlay
  // re-rendering on every tween tick.
  const flippingCardElRef = useRef<HTMLDivElement | null>(null);
  const frontFaceElRef = useRef<HTMLDivElement | null>(null);
  const backFaceElRef = useRef<HTMLDivElement | null>(null);

  // Latest-state ref so GSAP `.call()` callbacks read live values (avoid stale
  // closures when the timeline is built once but fires later).
  const stateRef = useRef<TurnState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Stable refs for handlers we need to forward through GSAP / queue drain.
  const onSwapRef = useRef(onSwap);
  useEffect(() => {
    onSwapRef.current = onSwap;
  }, [onSwap]);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const playbackActions = usePlaybackActions();
  const playbackActionsRef = useRef(playbackActions);
  useEffect(() => {
    playbackActionsRef.current = playbackActions;
  }, [playbackActions]);

  // Forward declaration — startTurn closes over `onSwap` etc. but the queue
  // drain (inside settleHandler) needs to call the *latest* startTurn.
  const startTurnRef = useRef<(p: StartTurnParams) => void>(() => {});

  /** Reset all transient state to idle. Used by both settle and cancel paths. */
  const resetToIdle = useCallback(() => {
    timelineRef.current = null;
    swappedRef.current = false;
    flippingCardElRef.current = null;
    frontFaceElRef.current = null;
    backFaceElRef.current = null;
    // Sync stateRef BEFORE setState so a microtask draining the queue (in
    // settleHandler) sees phase='idle' before React commits + the sync effect
    // runs. Without this the queued turn is re-enqueued and dropped.
    stateRef.current = INITIAL_STATE;
    setState(INITIAL_STATE);
    setVisual(null);
  }, []);

  // === Settle (timeline onComplete) ===
  const settleHandler = useCallback(() => {
    const elapsed = performance.now() - stateRef.current.startedAt;
    log.info('settled', 'turn complete', { totalMs: Math.round(elapsed) });
    playbackActionsRef.current.resumeAutoplay();
    try {
      onCompleteRef.current?.();
    } catch (err) {
      log.error('settled', 'onComplete threw', { error: String(err) });
    }
    // Drain queued turn BEFORE resetting state — capture local first so the
    // microtask sees the queued params even if a later setState() races.
    const queued = queuedTurnRef.current;
    queuedTurnRef.current = null;
    resetToIdle();
    if (queued) {
      log.debug('settled', 'draining queued turn', queued as unknown as Record<string, unknown>);
      queueMicrotask(() => {
        startTurnRef.current(queued);
      });
    }
  }, [resetToIdle]);

  // === Swap midpoint handler ===
  // The actual `onSwap` (caller's `applySelectedSpreadChange`) was already fired
  // in `startTurn` so the new spread renders underneath the overlay throughout
  // the entire flip. This handler now only flips face opacity at the edge-on
  // beat (-/+90°) and emits a telemetry phase tick.
  const swapPointHandler = useCallback(() => {
    const live = stateRef.current;
    log.debug('swapPoint', 'face flip at edge-on', {
      elapsed: Math.round(performance.now() - live.startedAt),
    });
    if (frontFaceElRef.current) gsap.set(frontFaceElRef.current, { opacity: 0 });
    if (backFaceElRef.current) gsap.set(backFaceElRef.current, { opacity: 1 });
    // Mark the brief "swapping" beat for telemetry; immediately back to flipping
    // for the second-half tween. Two setStates batched by React.
    setState((prev) => ({ ...prev, phase: 'swapping' }));
    setState((prev) => ({ ...prev, phase: 'flipping' }));
  }, []);

  // === Cancel ===
  const cancel = useCallback(() => {
    const live = stateRef.current;
    log.warn('cancel', 'mid-flight cancel', {
      phase: live.phase,
      elapsed: live.startedAt > 0 ? Math.round(performance.now() - live.startedAt) : 0,
    });
    if (timelineRef.current) {
      // GSAP `.kill()` does NOT fire onComplete — null it defensively anyway.
      timelineRef.current.eventCallback('onComplete', null);
      timelineRef.current.kill();
      timelineRef.current = null;
    }
    // Force-commit swap if not yet done so caller's selectedSpreadId is consistent.
    if (!swappedRef.current && live.toSpreadId) {
      try {
        onSwapRef.current(live.toSpreadId);
      } catch (err) {
        log.error('cancel', 'onSwap threw on force-commit', { error: String(err) });
      }
    }
    playbackActionsRef.current.resumeAutoplay();
    resetToIdle();
  }, [resetToIdle]);

  // === Start turn ===
  const startTurn = useCallback(
    (req: StartTurnParams) => {
      log.info('startTurn', 'requested', {
        fromSpreadId: req.fromSpreadId,
        toSpreadId: req.toSpreadId,
        direction: req.direction,
      });

      // Already running → enqueue (max 1 slot, overwrite older queued turn).
      if (stateRef.current.phase !== 'idle') {
        queuedTurnRef.current = req;
        log.debug('startTurn', 'queued (mid-flight)', {
          phase: stateRef.current.phase,
          toSpreadId: req.toSpreadId,
        });
        return;
      }

      // Bypass: explicit debug-disable flag.
      if (readDebugFlag(DEBUG_DISABLE_FLAG)) {
        log.debug('startTurn', 'debug disabled — bypass', { toSpreadId: req.toSpreadId });
        onSwapRef.current(req.toSpreadId);
        return;
      }

      // Bypass: prefers-reduced-motion.
      if (prefersReducedMotion()) {
        log.debug('startTurn', 'reduced-motion — bypass', { toSpreadId: req.toSpreadId });
        onSwapRef.current(req.toSpreadId);
        return;
      }

      // Bypass: hook disabled at caller.
      if (!enabled) {
        log.debug('startTurn', 'disabled — bypass', { toSpreadId: req.toSpreadId });
        onSwapRef.current(req.toSpreadId);
        return;
      }

      const container = spreadContainerGetter();
      if (!container) {
        log.warn('startTurn', 'no container — bypass', {
          fromSpreadId: req.fromSpreadId,
          toSpreadId: req.toSpreadId,
        });
        onSwapRef.current(req.toSpreadId);
        return;
      }

      // Resolve layout from container's data attribute (set by PlayerCanvas).
      // 3-way mapping: 'spread' → spread, 'left' → single-left, 'right' → single-right.
      // Defensive fallback per spec §3.4: missing/unknown → 'single-right' + warn.
      const fullPageMode = container.dataset.fullPageMode;
      let layout: TurnLayout;
      switch (fullPageMode) {
        case 'spread':
          layout = 'spread';
          break;
        case 'left':
          layout = 'single-left';
          break;
        case 'right':
          layout = 'single-right';
          break;
        default:
          log.warn('startTurn', 'turn_unknown_layout — defaulting to single-right', {
            fullPageMode,
          });
          layout = 'single-right';
          break;
      }
      log.debug('startTurn', 'layout resolved', { layout, fullPageMode });

      // Capture geometry BEFORE snapshot so the DOM clone cost doesn't skew the rect.
      const rect = container.getBoundingClientRect();
      const snapshot = takeSnapshot(container, req.direction, layout);
      if (!snapshot) {
        log.warn('startTurn', 'snapshot failed — bypass', { fromSpreadId: req.fromSpreadId });
        onSwapRef.current(req.toSpreadId);
        return;
      }

      // Mark swap "committed" up-front: we fire onSwap immediately below so the
      // new spread renders under the overlay during the flip (rather than after
      // settle). The face-flip at midpoint is now purely visual.
      swappedRef.current = true;

      // Suspend BEFORE onSwap so the player engine effects, which re-run when
      // selectedSpread changes, see `autoplaySuspended=true` and short-circuit.
      playbackActionsRef.current.suspendAutoplay();
      setVisual({ snapshot, containerRect: rect, backNode: null });
      setState({
        phase: 'flipping',
        direction: req.direction,
        layout,
        fromSpreadId: req.fromSpreadId,
        toSpreadId: req.toSpreadId,
        startedAt: performance.now(),
        queuedTurn: null,
      });

      // Commit underlying spread change. Overlay (mounting in same React batch)
      // covers the outgoing half with the cloned snapshot, so the user sees the
      // new spread reveal beneath the rotating page.
      try {
        onSwapRef.current(req.toSpreadId);
      } catch (err) {
        log.error('startTurn', 'onSwap threw on commit', {
          error: String(err),
          toSpreadId: req.toSpreadId,
        });
      }

      // Schedule NEW-content snapshot for the BackFace so the user sees NEW
      // content rotate in past midpoint. Wait 2 rAFs:
      //   rAF #1: React commits the post-onSwap render
      //   rAF #2: browser paints; container DOM now reflects NEW spread
      // First-half tween is duration/2 (~450ms at default 900ms) — plenty of
      // headroom for the snapshot to land before midpoint. If it doesn't (rare),
      // overlay's BackFace falls back to the paper bg.
      const turnIdAtStart = req.toSpreadId; // capture for race guard
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Race guard: if a new turn started or hook unmounted, skip.
          if (stateRef.current.toSpreadId !== turnIdAtStart) {
            log.debug('startTurn', 'back snapshot stale — skip', {
              expected: turnIdAtStart,
              current: stateRef.current.toSpreadId,
            });
            return;
          }
          const liveContainer = spreadContainerGetter();
          if (!liveContainer) {
            log.warn('startTurn', 'back snapshot — container missing post-swap', {
              toSpreadId: turnIdAtStart,
            });
            return;
          }
          const backSnap = takeSnapshot(liveContainer, req.direction, layout);
          if (!backSnap) return;
          // We only need flippingNode (the BackFace clip-path restricts to the
          // flipping half). staticNode would be unused on the back path.
          setVisual((prev) =>
            prev ? { ...prev, backNode: backSnap.flippingNode } : prev,
          );
          log.debug('startTurn', 'back snapshot mounted', { toSpreadId: turnIdAtStart });
        });
      });
    },
    [enabled, spreadContainerGetter],
  );

  // Keep latest startTurn in ref for the queue-drain microtask.
  useEffect(() => {
    startTurnRef.current = startTurn;
  }, [startTurn]);

  // === Effect: build GSAP timeline once phase=flipping AND flippingCard ref attached ===
  useEffect(() => {
    if (state.phase !== 'flipping') return;
    if (timelineRef.current) return; // already built

    const flippingEl = flippingCardElRef.current;
    if (!flippingEl) {
      // Refs attach via ref objects on overlay mount; they're populated AFTER
      // the overlay returns from createPortal. Re-run this effect on the next
      // animation frame to pick up the freshly attached ref.
      log.debug('buildTimeline', 'flipping card ref not yet attached — wait next frame');
      let alive = true;
      const raf = requestAnimationFrame(() => {
        if (!alive) return;
        // Touch state to retrigger this effect. Use a no-op spread so React
        // sees a new object identity (deps include `state.phase`, but the ref
        // attach happens between render & this effect's commit — safe retry).
        setState((prev) => (prev.phase === 'flipping' ? { ...prev } : prev));
      });
      return () => {
        alive = false;
        cancelAnimationFrame(raf);
      };
    }

    const direction = state.direction;
    if (!direction) {
      log.warn('buildTimeline', 'phase=flipping but direction=null — abort');
      return;
    }

    // Resolve duration with debug-slow multiplier.
    const debugSlow = readDebugFlag(DEBUG_SLOW_FLAG);
    const baseDuration = duration ?? DEFAULT_TURN_DURATION_MS;
    const effectiveMs = debugSlow ? baseDuration * 4 : baseDuration;

    // Pivot strategy: shared map keeps overlay CSS + GSAP set in sync.
    //   spread       → 50% 50% (gutter)
    //   single-left  → 100% 50% (right edge = spine side of left page)
    //   single-right → 0% 50% (left edge = spine side of right page)
    if (!state.layout) {
      log.warn('buildTimeline', 'phase=flipping but layout=null — abort');
      return;
    }
    const pivotOrigin = LAYOUT_PIVOT_MAP[state.layout];
    const endRotation = direction === 'next' ? -180 : 180;

    log.debug('buildTimeline', 'building', {
      direction,
      layout: state.layout,
      durationMs: effectiveMs,
      pivotOrigin,
      endRotation,
    });

    gsap.set(flippingEl, {
      transformOrigin: pivotOrigin,
      // perspective lives on the overlay portal positioner (parent) so the
      // composed orientation of FrontFace / BackFace is evaluated by the
      // browser in a proper 3D context. backfaceVisibility on the FlippingCard
      // itself is irrelevant — only the faces are flipped.
      rotationY: 0,
    });

    const halfSec = effectiveMs / 2 / 1000;
    const tl = gsap.timeline({
      onComplete: () => {
        settleHandler();
      },
    });
    tl.to(flippingEl, {
      rotationY: endRotation / 2,
      duration: halfSec,
      ease: EASE_HALF_FIRST,
    });
    tl.call(() => {
      swapPointHandler();
    });
    tl.to(flippingEl, {
      rotationY: endRotation,
      duration: halfSec,
      ease: EASE_HALF_SECOND,
    });

    timelineRef.current = tl;

    // Cleanup: only kill if this effect is tearing down with a live timeline
    // (e.g. unmount mid-flight). Settle path nulls timelineRef itself.
    return () => {
      if (timelineRef.current === tl) {
        tl.eventCallback('onComplete', null);
        tl.kill();
        timelineRef.current = null;
      }
    };
  }, [state.phase, state.direction, state.layout, duration, settleHandler, swapPointHandler]);

  // === Cleanup on unmount ===
  useEffect(() => {
    return () => {
      if (timelineRef.current) {
        timelineRef.current.eventCallback('onComplete', null);
        timelineRef.current.kill();
        timelineRef.current = null;
      }
      queuedTurnRef.current = null;
    };
  }, []);

  // === Build overlay props (memoized — only changes on phase / visual identity) ===
  const overlayProps: SpreadTurnOverlayProps | null = useMemo(() => {
    if (state.phase === 'idle' || !visual) return null;
    return {
      snapshot: visual.snapshot,
      containerRect: visual.containerRect,
      backNode: visual.backNode,
      refs: {
        flippingCardRef: flippingCardElRef,
        frontFaceRef: frontFaceElRef,
        backFaceRef: backFaceElRef,
      },
    };
  }, [state.phase, visual]);

  return {
    startTurn,
    cancel,
    isActive: state.phase !== 'idle',
    phase: state.phase,
    overlayProps,
  };
}
