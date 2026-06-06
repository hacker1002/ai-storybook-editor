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
import { takeSnapshot } from './spread-turn-snapshot';
import {
  DEFAULT_TURN_DURATION_MS,
  DEBUG_DISABLE_FLAG,
  DEBUG_SLOW_FLAG,
} from './spread-turn-constants';
import { computeFlipTransform } from './spread-flip-transform';
import type {
  StartTurnParams,
  TurnLayout,
  TurnSnapshot,
  TurnState,
  UseSpreadTurnTransitionParams,
} from './spread-turn-types';
import type { SpreadTurnOverlayProps } from './spread-turn-overlay';

const log = createLogger('Editor', 'useSpreadTurnTransition');

/** Delay (ms) before cloning the NEW spread into the BackFace. Held off until
 *  near the midpoint of the flip (default duration 900ms → midpoint at 450ms)
 *  so that PlayerCanvas has fully re-mounted, items have laid out, and image
 *  decode has settled. Earlier 2-rAF strategy raced ahead of mount on heavier
 *  spreads → BackFace inherited an empty container → cream paper bg leaked
 *  through. Clamped per-call to `halfDuration - SAFETY_MARGIN_MS` so custom-
 *  duration callers (debug-slow, short transitions) still snapshot before the
 *  back face becomes visible. */
const BACK_SNAPSHOT_DELAY_MS = 400;
const SAFETY_MARGIN_MS = 50;

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
  const {
    enabled,
    spreadContainerGetter,
    onSwap,
    onComplete,
    duration,
  } = params;

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
  /** Guard for the deferred back-snapshot — prevents setVisual after unmount.
   *  Set false in the unmount cleanup effect. */
  const isMountedRef = useRef<boolean>(true);
  /** Pending back-snapshot timeout — cleared on unmount + cancel + new turn so
   *  a deferred snapshot from a stale turn cannot overwrite a fresh BackFace. */
  const backSnapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (backSnapshotTimerRef.current) {
      clearTimeout(backSnapshotTimerRef.current);
      backSnapshotTimerRef.current = null;
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

      // Container DOM is ALWAYS the full spread (scaledWidth × scaledHeight),
      // regardless of fullPageMode (outer wrapper just clips one half off-screen).
      // → animation behavior is identical across modes; pivot stays at gutter.
      // If the flipping half is off-screen in fullPageMode, that's accepted —
      // we don't reshape the animation to chase the visible half.
      const fullPageMode = container.dataset.fullPageMode;
      const layout: TurnLayout = 'spread';
      log.debug('startTurn', 'layout resolved (forced spread)', { layout, fullPageMode });

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

      // Initial mount: BackFace gets paper-bg placeholder (backNode=null). The
      // 2-rAF post-paint clone below replaces it with the live PlayerCanvas
      // spread container, which by then has been re-rendered + had GSAP
      // applyInitialStates run on it (fade-in items at autoAlpha=0, fly-in
      // off-screen). That gives pixel-exact handoff at settle — no flicker.
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

      // Deferred back-snapshot. Wait close to the flip midpoint so PlayerCanvas
      // has fully re-mounted the new spread, items laid out, image decode
      // settled. Clamp delay against per-call duration so custom-duration
      // callers (short transitions, debug-slow inverse) still snapshot before
      // the back face becomes visible at midpoint.
      const totalMs = duration ?? DEFAULT_TURN_DURATION_MS;
      const halfMs = totalMs / 2;
      const delayMs = Math.max(0, Math.min(BACK_SNAPSHOT_DELAY_MS, halfMs - SAFETY_MARGIN_MS));
      const turnIdAtStart = req.toSpreadId; // race guard
      const backStartedAt = performance.now();

      // Clear any pending timer from a prior turn (cancel/queue may not have
      // run cleanup if a turn was force-completed). New turn owns the slot.
      if (backSnapshotTimerRef.current) {
        clearTimeout(backSnapshotTimerRef.current);
      }
      backSnapshotTimerRef.current = setTimeout(() => {
        backSnapshotTimerRef.current = null;
        if (!isMountedRef.current) return;
        if (stateRef.current.toSpreadId !== turnIdAtStart) {
          log.debug('startTurn', 'back snapshot stale — skip', {
            expected: turnIdAtStart,
            current: stateRef.current.toSpreadId,
          });
          return;
        }
        const liveContainer = spreadContainerGetter();
        if (!liveContainer || liveContainer.clientWidth === 0) {
          log.warn('startTurn', 'back snapshot — container missing/zero-width', {
            toSpreadId: turnIdAtStart,
          });
          return;
        }
        const backSnap = takeSnapshot(liveContainer, req.direction, layout);
        if (!backSnap) {
          log.warn('startTurn', 'back snapshot — takeSnapshot returned null', {
            toSpreadId: turnIdAtStart,
          });
          return;
        }
        // BackFace has its own CSS clip-path (INVERSE half) — using
        // backSnap.flippingNode works because the snapshot-level half-clip
        // and the layer-level INVERSE clip overlap to the same visible
        // region. Tech debt: takeSnapshot returns pre-clipped nodes; ideally
        // we'd want a full clone here. Defer to separate refactor.
        setVisual((prev) =>
          prev ? { ...prev, backNode: backSnap.flippingNode } : prev,
        );
        log.debug('startTurn', 'back snapshot ready', {
          latency_ms: Math.round(performance.now() - backStartedAt),
          delay_ms: delayMs,
          toSpreadId: turnIdAtStart,
        });
      }, delayMs);
    },
    // `duration` is read inside (back-snapshot clamp) — include it so the callback
    // reflects per-call duration overrides (also satisfies preserve-manual-memoization).
    [enabled, spreadContainerGetter, duration],
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

    if (!state.layout) {
      log.warn('buildTimeline', 'phase=flipping but layout=null — abort');
      return;
    }
    const layout = state.layout;
    const frontEl = frontFaceElRef.current;
    const backEl = backFaceElRef.current;

    log.debug('buildTimeline', 'building', {
      direction,
      layout,
      durationMs: effectiveMs,
    });

    // Single-source flip driver: a linear progress proxy (p: 0 → 1, ease 'none')
    // whose `onUpdate` applies `computeFlipTransform`. Easing (power2.in/out) and
    // the midpoint hard face-swap (front 1→0, back 0→1 at p=0.5) are baked into
    // `computeFlipTransform` — same math the Remotion render side uses (design 07
    // §3) so player === render. Replaces the old 2-phase `tl.to().call().to()`.
    const applyFlip = (p: number) => {
      const t = computeFlipTransform(p, direction, layout);
      gsap.set(flippingEl, {
        transformOrigin: t.transformOrigin,
        rotationY: t.rotateY_deg,
      });
      if (frontEl) gsap.set(frontEl, { opacity: t.frontOpacity });
      if (backEl) gsap.set(backEl, { opacity: t.backOpacity });
    };

    // Seed the initial (p=0) state imperatively before the tween's first tick.
    applyFlip(0);

    const proxy = { p: 0 };
    const tl = gsap.timeline({
      onComplete: () => {
        settleHandler();
      },
    });
    tl.to(proxy, {
      p: 1,
      duration: effectiveMs / 1000,
      ease: 'none',
      onUpdate: () => applyFlip(proxy.p),
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
  }, [state.phase, state.direction, state.layout, duration, settleHandler]);

  // === Cleanup on unmount ===
  // Reset isMountedRef on every mount — under StrictMode (and HMR remount) the
  // initial useRef(true) fires once, but the cleanup below sets it false on
  // strict-mode unmount, leaving the second mount with a stuck `false` flag
  // that suppresses every deferred back-snapshot.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timelineRef.current) {
        timelineRef.current.eventCallback('onComplete', null);
        timelineRef.current.kill();
        timelineRef.current = null;
      }
      if (backSnapshotTimerRef.current) {
        clearTimeout(backSnapshotTimerRef.current);
        backSnapshotTimerRef.current = null;
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
