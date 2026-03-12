// use-player-gsap-engine.ts - GSAP animation engine hook extracted from PlayerCanvas
// Manages timelines, refs, and all GSAP side effects for playback

import { useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import gsap from 'gsap';
import type { AnimationStep, PlayableSpread } from '../types';
import { TRIGGER_DELAY } from '../constants';
import {
  usePlaybackStore,
  usePlayerPhase,
  useCurrentStepIndex,
  usePlayMode,
  useIsPlaying,
  useVolume,
  usePlaybackActions,
} from '../../../stores/animation-playback-store';
import { addTweenToTimeline } from '../animation-tween-builders';
import {
  applyInitialStates,
  resetElementStyles,
  resolveInitialState,
  resolveAnimationEndState,
} from '../player-initial-states';
import { getScaledDimensions } from '../../shared';

// === Hook Interfaces ===

export interface UsePlayerGsapEngineParams {
  spread: PlayableSpread;
  zoomLevel: number;
  onSpreadComplete: (spreadId: string) => void;
}

export interface UsePlayerGsapEngineReturn {
  spreadContainerRef: React.RefObject<HTMLDivElement | null>;
  registerRef: (itemId: string) => (el: HTMLElement | null) => void;
  handleClickLoopReplay: (step: AnimationStep) => void;
  killTimeline: () => void;
  applyStepFinalStates: (step: AnimationStep) => void;
  reApplyInitialStates: (fromStepIndex: number) => void;
}

// === Hook Implementation ===

/**
 * Manages GSAP animation engine for playback.
 * Handles timelines, element refs, and all animation side effects.
 * Reads playback state from Zustand store; does NOT dispatch RESET (handled by parent).
 */
export function usePlayerGsapEngine({
  spread,
  zoomLevel,
  onSpreadComplete,
}: UsePlayerGsapEngineParams): UsePlayerGsapEngineReturn {
  // === Store Subscriptions ===
  const phase = usePlayerPhase();
  const currentStepIndex = useCurrentStepIndex();
  const playMode = usePlayMode();
  const isPlaying = useIsPlaying();
  const volume = useVolume();
  const playbackActions = usePlaybackActions();
  // Access steps directly from store for effects that need them
  const steps = usePlaybackStore((s) => s.steps);

  // === Refs ===
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const replayTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const elementRefsMap = useRef<Map<string, HTMLElement>>(new Map());
  const spreadContainerRef = useRef<HTMLDivElement>(null);
  const prevStepIndexRef = useRef<number>(-1);
  const pendingRafRef = useRef<number | null>(null);

  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(zoomLevel);

  // === Helpers ===

  const killTimeline = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }
  }, []);

  const killReplayTimeline = useCallback(() => {
    if (replayTimelineRef.current) {
      replayTimelineRef.current.kill();
      replayTimelineRef.current = null;
    }
  }, []);

  const cancelPendingRaf = useCallback(() => {
    if (pendingRafRef.current !== null) {
      cancelAnimationFrame(pendingRafRef.current);
      pendingRafRef.current = null;
    }
  }, []);

  const registerRef = useCallback((itemId: string) => {
    return (el: HTMLElement | null) => {
      if (el) {
        // Target the inner visual element (position:absolute with explicit geometry)
        // instead of the 0x0 wrapper div. GSAP transforms on the wrapper would create
        // a containing block, collapsing the inner element's percentage-based dimensions.
        const visualChild = el.firstElementChild as HTMLElement;
        elementRefsMap.current.set(itemId, visualChild ?? el);
      } else {
        elementRefsMap.current.delete(itemId);
      }
    };
  }, []);

  // === Pre-compute container dimensions (avoid repeated getBoundingClientRect) ===
  const getContainerDims = useCallback(() => {
    const rect = spreadContainerRef.current?.getBoundingClientRect();
    return {
      containerWidth: rect?.width ?? scaledWidth,
      containerHeight: rect?.height ?? scaledHeight,
    };
  }, [scaledWidth, scaledHeight]);

  // === Item geometry lookup for Lines/Arcs delta calculation ===
  const findItemGeometry = useCallback(
    (targetId: string): { x: number; y: number } | undefined => {
      const items: Array<{ id: string; geometry: { x: number; y: number } }> = [
        ...(spread.images || []),
        ...(spread.shapes || []),
        ...(spread.videos || []),
        ...(spread.audios || []),
      ];
      return items.find((i) => i.id === targetId)?.geometry;
    },
    [spread.images, spread.shapes, spread.videos, spread.audios]
  );

  // === Timeline Builders ===

  const buildAndPlayStepTimeline = useCallback(
    (step: AnimationStep) => {
      killTimeline();
      usePlaybackStore.getState().setActiveAnimationOrders([]);
      const tl = gsap.timeline({
        onComplete: () => playbackActions.stepComplete(),
      });

      const dims = getContainerDims();

      step.animations.forEach((anim, i) => {
        const el = elementRefsMap.current.get(anim.target.id);
        if (!el) {
          console.warn(`[usePlayerGsapEngine] Element not found: ${anim.target.id}`);
          return;
        }

        let position: number | string;
        if (i === 0) {
          position = 0;
        } else if (anim.trigger_type === 'with_previous') {
          position = '<';
        } else {
          // after_previous
          position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;
        }

        addTweenToTimeline(tl, anim, el, position, {
          volume: volume / 100,
          spreadContainer: spreadContainerRef.current,
          itemGeometry: findItemGeometry(anim.target.id),
          ...dims,
          onTweenStart: () => usePlaybackStore.getState().addActiveAnimationOrder(anim.order),
          onTweenComplete: () => usePlaybackStore.getState().removeActiveAnimationOrder(anim.order),
        });
      });

      timelineRef.current = tl;
      tl.play();
    },
    [killTimeline, volume, playbackActions, getContainerDims, findItemGeometry]
  );

  const buildAndPlayFullTimeline = useCallback(() => {
    killTimeline();
    usePlaybackStore.getState().setActiveAnimationOrders([]);
    const tl = gsap.timeline({
      onComplete: () => {
        // Root component handles auto-advance; we only signal completion
        onSpreadComplete(spread.id);
      },
    });

    const dims = getContainerDims();
    const animations = [...spread.animations].sort((a, b) => a.order - b.order);

    animations.forEach((anim, i) => {
      const el = elementRefsMap.current.get(anim.target.id);
      if (!el) {
        console.warn(`[usePlayerGsapEngine] Element not found: ${anim.target.id}`);
        return;
      }

      let position: number | string;
      if (i === 0) {
        position = 0;
      } else if (anim.trigger_type === 'with_previous') {
        position = '<';
      } else if (anim.trigger_type === 'after_previous') {
        position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;
      } else {
        // on_click or on_next in auto mode → play with delay
        position = `>+=${TRIGGER_DELAY.ON_CLICK_AUTO}`;
      }

      addTweenToTimeline(tl, anim, el, position, {
        volume: volume / 100,
        spreadContainer: spreadContainerRef.current,
        itemGeometry: findItemGeometry(anim.target.id),
        ...dims,
        onTweenStart: () => usePlaybackStore.getState().addActiveAnimationOrder(anim.order),
        onTweenComplete: () => usePlaybackStore.getState().removeActiveAnimationOrder(anim.order),
      });
    });

    timelineRef.current = tl;
    tl.play();
  }, [killTimeline, volume, spread.animations, spread.id, onSpreadComplete, getContainerDims, findItemGeometry]);

  // === Click Loop Replay (independent timeline) ===

  const handleClickLoopReplay = useCallback(
    (step: AnimationStep) => {
      killReplayTimeline();
      usePlaybackStore.getState().setActiveAnimationOrders([]);

      const replayTl = gsap.timeline({
        onComplete: () => {
          // Clear active orders when replay finishes
          usePlaybackStore.getState().setActiveAnimationOrders([]);
        },
      });
      const dims = getContainerDims();

      step.animations.forEach((anim, i) => {
        const el = elementRefsMap.current.get(anim.target.id);
        if (!el) return;

        // Clear transforms from previous play, then reset to initial state.
        // Emphasis effects (Spin, Grow/Shrink, Teeter) leave residual rotation/scale;
        // without clearing, absolute tweens (e.g. rotation: 5) would be a no-op.
        gsap.set(el, { clearProps: 'transform,transformOrigin' });
        const initialProps = resolveInitialState(anim, spreadContainerRef.current);
        if (Object.keys(initialProps).length > 0) {
          gsap.set(el, initialProps);
        }

        let position: number | string;
        if (i === 0) position = 0;
        else if (anim.trigger_type === 'with_previous') position = '<';
        else position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;

        addTweenToTimeline(replayTl, anim, el, position, {
          volume: volume / 100,
          spreadContainer: spreadContainerRef.current,
          itemGeometry: findItemGeometry(anim.target.id),
          ...dims,
          onTweenStart: () => usePlaybackStore.getState().addActiveAnimationOrder(anim.order),
          onTweenComplete: () => usePlaybackStore.getState().removeActiveAnimationOrder(anim.order),
        });
      });

      replayTimelineRef.current = replayTl;
      replayTl.play();
    },
    [killReplayTimeline, volume, getContainerDims, findItemGeometry]
  );

  // === Returned utility functions ===

  /**
   * Apply final GSAP end states for all animations in a step.
   * Used by parent when skipping forward to set visual end state.
   */
  const applyStepFinalStates = useCallback(
    (step: AnimationStep) => {
      step.animations.forEach((anim) => {
        const el = elementRefsMap.current.get(anim.target.id);
        if (!el) return;
        const endState = resolveAnimationEndState(anim, spreadContainerRef.current, findItemGeometry(anim.target.id));
        if (Object.keys(endState).length > 0) {
          gsap.set(el, endState);
        }
      });
    },
    [findItemGeometry]
  );

  /**
   * Reset visual state of elements affected from fromStepIndex forward,
   * then re-apply end states for all steps before fromStepIndex.
   * Used by parent when navigating backward.
   */
  const reApplyInitialStates = useCallback(
    (fromStepIndex: number) => {
      // Collect targets affected from fromStepIndex forward
      const affectedTargets = new Set<string>();
      for (let i = fromStepIndex; i < steps.length; i++) {
        steps[i]?.animations.forEach((a) => affectedTargets.add(a.target.id));
      }

      // Clear GSAP props for affected elements
      affectedTargets.forEach((tid) => {
        const el = elementRefsMap.current.get(tid);
        if (el) gsap.set(el, { clearProps: 'opacity,visibility,transform,transformOrigin' });
      });

      // Re-apply initial states for affected targets
      applyInitialStates(
        spread.animations.filter((a) => affectedTargets.has(a.target.id)),
        elementRefsMap.current,
        spreadContainerRef.current
      );

      // Re-apply end states for steps 0..fromStepIndex-1
      for (let i = 0; i < fromStepIndex; i++) {
        steps[i]?.animations.forEach((anim) => {
          const el = elementRefsMap.current.get(anim.target.id);
          if (!el) return;
          const endState = resolveAnimationEndState(
            anim,
            spreadContainerRef.current,
            findItemGeometry(anim.target.id)
          );
          if (Object.keys(endState).length > 0) gsap.set(el, endState);
        });
      }
    },
    [steps, spread.animations, findItemGeometry]
  );

  // === Lifecycle: Cleanup on unmount ===
  useLayoutEffect(() => {
    return () => {
      cancelPendingRaf();
      killTimeline();
      killReplayTimeline();
    };
  }, [cancelPendingRaf, killTimeline, killReplayTimeline]);

  // === Lifecycle: Spread change → kill timelines, reset styles, apply initial states ===
  // NOTE: RESET dispatch (store) is NOT done here — it's done by the parent (PlayerCanvas).
  useEffect(() => {
    cancelPendingRaf();
    killTimeline();
    killReplayTimeline();
    resetElementStyles(elementRefsMap.current);
    applyInitialStates(spread.animations, elementRefsMap.current, spreadContainerRef.current);

    prevStepIndexRef.current = -1;

    // Auto mode: rebuild full timeline on spread change if already playing
    if (playMode === 'auto' && isPlaying) {
      pendingRafRef.current = requestAnimationFrame(() => {
        pendingRafRef.current = null;
        buildAndPlayFullTimeline();
      });
    }

    return () => {
      cancelPendingRaf();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread.id]);

  // === Lifecycle: Phase change → build step timeline (semi-auto mode) ===
  useEffect(() => {
    if (playMode !== 'semi-auto') return;
    if (phase !== 'playing' || currentStepIndex < 0) return;

    const currentIdx = currentStepIndex;
    const prevIdx = prevStepIndexRef.current;

    // Detect USER_BACK: currentStepIndex decreased
    if (prevIdx >= 0 && currentIdx < prevIdx) {
      // Re-apply: reset affected items, then set end states for steps 0..currentIdx-1
      const affectedTargets = new Set<string>();
      for (let i = currentIdx + 1; i <= prevIdx; i++) {
        steps[i]?.animations.forEach((a) => affectedTargets.add(a.target.id));
      }
      affectedTargets.forEach((tid) => {
        const el = elementRefsMap.current.get(tid);
        if (el) gsap.set(el, { clearProps: 'opacity,visibility,transform,transformOrigin' });
      });

      // Re-apply initial states for affected targets
      applyInitialStates(
        spread.animations.filter((a) => affectedTargets.has(a.target.id)),
        elementRefsMap.current,
        spreadContainerRef.current
      );

      // Re-apply end states for steps 0..currentIdx-1
      for (let i = 0; i < currentIdx; i++) {
        steps[i]?.animations.forEach((anim) => {
          const el = elementRefsMap.current.get(anim.target.id);
          if (!el) return;
          const endState = resolveAnimationEndState(
            anim,
            spreadContainerRef.current,
            findItemGeometry(anim.target.id)
          );
          if (Object.keys(endState).length > 0) gsap.set(el, endState);
        });
      }
    }

    prevStepIndexRef.current = currentIdx;
    const step = steps[currentIdx];
    if (step) buildAndPlayStepTimeline(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentStepIndex, playMode]);

  // === Lifecycle: Auto mode — play toggle or spread change ===
  useEffect(() => {
    if (playMode !== 'auto') return;

    if (isPlaying) {
      if (!timelineRef.current || phase === 'complete') {
        cancelPendingRaf();
        pendingRafRef.current = requestAnimationFrame(() => {
          pendingRafRef.current = null;
          resetElementStyles(elementRefsMap.current);
          applyInitialStates(spread.animations, elementRefsMap.current, spreadContainerRef.current);
          buildAndPlayFullTimeline();
        });
      } else {
        timelineRef.current.resume();
      }
    } else {
      timelineRef.current?.pause();
    }

    return () => {
      cancelPendingRaf();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, playMode]);

  // === Lifecycle: Semi-auto pause/resume ===
  useEffect(() => {
    if (playMode !== 'semi-auto') return;
    if (isPlaying) {
      timelineRef.current?.resume();
    } else {
      timelineRef.current?.pause();
    }
  }, [isPlaying, playMode]);

  // === Lifecycle: Volume sync ===
  useEffect(() => {
    const container = spreadContainerRef.current;
    if (!container) return;
    const mediaEls = container.querySelectorAll('audio, video');
    mediaEls.forEach((el) => {
      (el as HTMLMediaElement).volume = volume / 100;
    });
  }, [volume]);

  // === Lifecycle: Clear active animation orders when playback stops ===
  useEffect(() => {
    if (phase === 'idle' || phase === 'complete' || phase === 'awaiting_next' || phase === 'awaiting_click') {
      usePlaybackStore.getState().setActiveAnimationOrders([]);
    }
  }, [phase]);

  // === Return ===
  return {
    spreadContainerRef,
    registerRef,
    handleClickLoopReplay,
    killTimeline,
    applyStepFinalStates,
    reApplyInitialStates,
  };
}
