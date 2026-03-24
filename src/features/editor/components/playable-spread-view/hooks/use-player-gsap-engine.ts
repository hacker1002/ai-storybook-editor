// use-player-gsap-engine.ts - GSAP animation engine hook extracted from PlayerCanvas
// Manages timelines, refs, and all GSAP side effects for playback

import { useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import gsap from 'gsap';
import type { AnimationStep, PlayableSpread } from '@/types/playable-types';
import { EFFECT_TYPE } from '@/constants/playable-constants';
import {
  usePlaybackStore,
  usePlayerPhase,
  useCurrentStepIndex,
  usePlayMode,
  useIsPlaying,
  useVolume,
  useIsMuted,
  usePlaybackActions,
} from '@/stores/animation-playback-store';
import { addTweenToTimeline } from '../animation-tween-builders';
import { getTextboxContentForLanguage } from '../../../utils/textbox-helpers';
import {
  applyInitialStates,
  resetElementStyles,
  resolveInitialState,
  resolveAnimationEndState,
} from '../player-initial-states';
import { getScaledDimensions } from '../../../utils/coordinate-utils';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'usePlayerGsapEngine');

// === Helpers ===

/** Resolve textbox audio data (wordTimings + audioUrl) for READ_ALONG animations */
function resolveReadAlongAudioData(
  anim: { effect: { type: number }; target: { id: string; type: string } },
  textboxes: Record<string, unknown>[] | undefined,
  editorLangCode: string,
): { wordTimings?: import('@/types/spread-types').WordTiming[]; audioUrl?: string } {
  if (anim.effect.type !== EFFECT_TYPE.READ_ALONG || anim.target.type !== 'textbox') return {};
  const textbox = textboxes?.find((tb) => (tb as { id: string }).id === anim.target.id);
  if (!textbox) return {};
  const result = getTextboxContentForLanguage(textbox as Record<string, unknown>, editorLangCode);
  const media = result?.content?.audio?.media;
  const syncedMedia = media?.find((m) => m.script_synced) ?? media?.[0];
  if (!syncedMedia) return {};
  return { wordTimings: syncedMedia.word_timings, audioUrl: syncedMedia.url };
}

// === Constants ===
const TRIGGER_DELAY = {
  AFTER_PREVIOUS: 0.5,
  ON_CLICK_AUTO: 1.0,
  FIRST_ANIMATION: 0.5,
  AUTO_SPREAD_COMPLETE: 1.0,
} as const;

// === Hook Interfaces ===

export interface UsePlayerGsapEngineParams {
  spread: PlayableSpread;
  /** Pre-filtered animations by playVersion (from PlayerCanvas prop, not store) */
  filteredAnimations: PlayableSpread['animations'];
  zoomLevel: number;
  editorLangCode: string;
  onSpreadComplete: (spreadId: string) => void;
  onQuizPlay?: (quizId: string) => void;
}

export interface UsePlayerGsapEngineReturn {
  spreadContainerRef: React.RefObject<HTMLDivElement | null>;
  registerRef: (itemId: string) => (el: HTMLElement | null) => void;
  handleClickLoopReplay: (step: AnimationStep) => void;
  killTimeline: () => void;
  applyStepFinalStates: (step: AnimationStep) => void;
  reApplyInitialStates: (fromStepIndex: number) => void;
  resumeTimeline: () => void;
  handleQuizComplete: () => void;
}

// === Hook Implementation ===

/**
 * Manages GSAP animation engine for playback.
 * Handles timelines, element refs, and all animation side effects.
 * Reads playback state from Zustand store; does NOT dispatch RESET (handled by parent).
 */
export function usePlayerGsapEngine({
  spread,
  filteredAnimations: versionFilteredAnimations,
  zoomLevel,
  editorLangCode,
  onSpreadComplete,
  onQuizPlay,
}: UsePlayerGsapEngineParams): UsePlayerGsapEngineReturn {
  // === Store Subscriptions ===
  const phase = usePlayerPhase();
  const currentStepIndex = useCurrentStepIndex();
  const playMode = usePlayMode();
  const isPlaying = useIsPlaying();
  const volume = useVolume();
  const isMuted = useIsMuted();
  const playbackActions = usePlaybackActions();

  const effectiveVolume = isMuted ? 0 : volume;
  // Access steps directly from store for effects that need them
  const steps = usePlaybackStore((s) => s.steps);

  // === Refs ===
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const replayTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const elementRefsMap = useRef<Map<string, HTMLElement>>(new Map());
  const spreadContainerRef = useRef<HTMLDivElement>(null);
  const prevStepIndexRef = useRef<number>(-1);
  const pendingRafRef = useRef<number | null>(null);
  const prevPlayModeRef = useRef(playMode);
  /** Tracks media elements that were playing when user paused, so we can resume them */
  const pausedMediaRef = useRef<Set<HTMLMediaElement>>(new Set());

  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(zoomLevel);

  // === Helpers ===

  const pauseAllMedia = useCallback(() => {
    const container = spreadContainerRef.current;
    if (!container) return;
    pausedMediaRef.current.clear();
    container.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => {
      if (!el.paused) {
        pausedMediaRef.current.add(el);
        el.pause();
      }
    });
  }, []);

  /** Resume media elements that were playing before the last pauseAllMedia() call */
  const resumePausedMedia = useCallback(() => {
    pausedMediaRef.current.forEach((el) => {
      if (el.isConnected) el.play().catch(() => {});
    });
    pausedMediaRef.current.clear();
  }, []);

  const killTimeline = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }
    pauseAllMedia();
  }, [pauseAllMedia]);

  const killReplayTimeline = useCallback(() => {
    if (replayTimelineRef.current) {
      replayTimelineRef.current.kill();
      replayTimelineRef.current = null;
    }
    pauseAllMedia();
  }, [pauseAllMedia]);

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
        ...(spread.quizzes || []),
      ];
      return items.find((i) => i.id === targetId)?.geometry;
    },
    [spread.images, spread.shapes, spread.videos, spread.audios, spread.quizzes]
  );

  // === Timeline Builders ===

  const buildAndPlayStepTimeline = useCallback(
    (step: AnimationStep) => {
      killTimeline();
      usePlaybackStore.getState().setActiveAnimationOrders([]);

      // Quiz-only step: bypass GSAP timeline entirely.
      // tl.call() + tl.addPause() with zero-duration timelines is unreliable —
      // GSAP may fire onComplete immediately or skip the pause.
      // Handle quiz PLAY synchronously instead.
      const isQuizOnlyStep = step.animations.every(
        (a) => a.effect.type === EFFECT_TYPE.PLAY && a.target.type === 'quiz'
      );

      if (isQuizOnlyStep) {
        log.debug('buildAndPlayStepTimeline', 'quiz-only step — skipping GSAP timeline', {
          animCount: step.animations.length,
        });
        timelineRef.current = null;
        step.animations.forEach((anim) => {
          usePlaybackStore.getState().addActiveAnimationOrder(anim.order);
          onQuizPlay?.(anim.target.id);
        });
        // stepComplete is called by handleQuizComplete when modal closes
        return;
      }

      const tl = gsap.timeline({
        onComplete: () => playbackActions.stepComplete(),
      });

      const dims = getContainerDims();

      step.animations.forEach((anim, i) => {
        // Quiz PLAY in a mixed step: pause timeline and invoke callback
        if (anim.effect.type === EFFECT_TYPE.PLAY && anim.target.type === 'quiz') {
          let position: number | string;
          if (i === 0) position = 0;
          else if (anim.trigger_type === 'with_previous') position = '<';
          else position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;
          tl.call(() => {
            usePlaybackStore.getState().addActiveAnimationOrder(anim.order);
            onQuizPlay?.(anim.target.id);
          }, undefined, position);
          tl.addPause();
          tl.call(() => usePlaybackStore.getState().removeActiveAnimationOrder(anim.order), undefined, '+=0.01');
          return;
        }

        const el = elementRefsMap.current.get(anim.target.id);
        if (!el) {
          log.warn('buildAndPlayStepTimeline', 'element not found', { targetId: anim.target.id });
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
          volume: effectiveVolume / 100,
          spreadContainer: spreadContainerRef.current,
          itemGeometry: findItemGeometry(anim.target.id),
          ...dims,
          ...resolveReadAlongAudioData(anim, spread.textboxes, editorLangCode),
          onTweenStart: () => usePlaybackStore.getState().addActiveAnimationOrder(anim.order),
          onTweenComplete: () => usePlaybackStore.getState().removeActiveAnimationOrder(anim.order),
        });
      });

      timelineRef.current = tl;
      tl.play();
    },
    [killTimeline, effectiveVolume, playbackActions, getContainerDims, findItemGeometry, onQuizPlay, spread.textboxes, editorLangCode]
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
    const animations = [...versionFilteredAnimations].sort((a, b) => a.order - b.order);

    animations.forEach((anim, i) => {
      // Quiz PLAY: pause timeline and invoke callback (auto mode too)
      if (anim.effect.type === EFFECT_TYPE.PLAY && anim.target.type === 'quiz') {
        let position: number | string;
        if (i === 0) position = 0;
        else if (anim.trigger_type === 'with_previous') position = '<';
        else if (anim.trigger_type === 'after_previous') position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;
        else position = `>+=${TRIGGER_DELAY.ON_CLICK_AUTO}`;
        tl.call(() => {
          usePlaybackStore.getState().addActiveAnimationOrder(anim.order);
          onQuizPlay?.(anim.target.id);
        }, undefined, position);
        tl.addPause();
        // Offset past pause so it only fires after resume
        tl.call(() => usePlaybackStore.getState().removeActiveAnimationOrder(anim.order), undefined, '+=0.01');
        return;
      }

      const el = elementRefsMap.current.get(anim.target.id);
      if (!el) {
        log.warn('buildAndPlayFullTimeline', 'element not found', { targetId: anim.target.id });
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

      // Read-Along: resolve textbox audio data for word-level highlighting
      let readAlongExtras: { wordTimings?: import('@/types/spread-types').WordTiming[]; audioUrl?: string } = {};
      if (anim.effect.type === EFFECT_TYPE.READ_ALONG && anim.target.type === 'textbox') {
        const textbox = spread.textboxes?.find((tb) => tb.id === anim.target.id);
        if (textbox) {
          const result = getTextboxContentForLanguage(textbox as Record<string, unknown>, editorLangCode);
          const media = result?.content?.audio?.media;
          const syncedMedia = media?.find((m) => m.script_synced) ?? media?.[0];
          if (syncedMedia) {
            readAlongExtras = { wordTimings: syncedMedia.word_timings, audioUrl: syncedMedia.url };
          }
        }
      }

      addTweenToTimeline(tl, anim, el, position, {
        volume: effectiveVolume / 100,
        spreadContainer: spreadContainerRef.current,
        itemGeometry: findItemGeometry(anim.target.id),
        ...dims,
        ...readAlongExtras,
        onTweenStart: () => usePlaybackStore.getState().addActiveAnimationOrder(anim.order),
        onTweenComplete: () => usePlaybackStore.getState().removeActiveAnimationOrder(anim.order),
      });
    });

    timelineRef.current = tl;
    tl.play();
  }, [killTimeline, effectiveVolume, versionFilteredAnimations, spread.id, onSpreadComplete, getContainerDims, findItemGeometry, onQuizPlay, spread.textboxes, editorLangCode]);

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
        // Quiz PLAY: invoke callback instead of addTweenToTimeline (same as playStep)
        if (anim.effect.type === EFFECT_TYPE.PLAY && anim.target.type === 'quiz') {
          let position: number | string;
          if (i === 0) position = 0;
          else if (anim.trigger_type === 'with_previous') position = '<';
          else position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;
          replayTl.call(() => {
            usePlaybackStore.getState().addActiveAnimationOrder(anim.order);
            onQuizPlay?.(anim.target.id);
          }, undefined, position);
          // No addPause in replay — just clear highlight after quiz callback
          replayTl.call(() => usePlaybackStore.getState().removeActiveAnimationOrder(anim.order));
          return;
        }

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
          volume: effectiveVolume / 100,
          spreadContainer: spreadContainerRef.current,
          itemGeometry: findItemGeometry(anim.target.id),
          ...dims,
          ...resolveReadAlongAudioData(anim, spread.textboxes, editorLangCode),
          onTweenStart: () => usePlaybackStore.getState().addActiveAnimationOrder(anim.order),
          onTweenComplete: () => usePlaybackStore.getState().removeActiveAnimationOrder(anim.order),
        });
      });

      replayTimelineRef.current = replayTl;
      replayTl.play();
    },
    [killReplayTimeline, effectiveVolume, getContainerDims, findItemGeometry, onQuizPlay, spread.textboxes, editorLangCode]
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

      // Clear GSAP props + read-along highlights for affected elements
      affectedTargets.forEach((tid) => {
        const el = elementRefsMap.current.get(tid);
        if (!el) return;
        gsap.set(el, { clearProps: 'opacity,visibility,transform,transformOrigin' });
        el.querySelectorAll('.read-along-active-word').forEach((w) => {
          w.classList.remove('read-along-active-word');
        });
      });

      // Re-apply initial states for affected targets
      applyInitialStates(
        versionFilteredAnimations.filter((a) => affectedTargets.has(a.target.id)),
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
    [steps, versionFilteredAnimations, findItemGeometry]
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
    applyInitialStates(versionFilteredAnimations, elementRefsMap.current, spreadContainerRef.current);

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

  // === Lifecycle: Phase change → build step timeline (manual/off mode) ===
  useEffect(() => {
    if (playMode !== 'off') return;
    if (phase !== 'playing' || currentStepIndex < 0) {
      // Keep ref in sync even when skipped — prevents spurious USER_BACK detection
      // when userBack sets phase=awaiting_next (effect skips) and later userNext plays
      prevStepIndexRef.current = currentStepIndex;
      return;
    }

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
        if (!el) return;
        gsap.set(el, { clearProps: 'opacity,visibility,transform,transformOrigin' });
        // Clear read-along highlights left by killed timeline
        el.querySelectorAll('.read-along-active-word').forEach((w) => {
          w.classList.remove('read-along-active-word');
        });
      });

      // Re-apply initial states for affected targets
      applyInitialStates(
        versionFilteredAnimations.filter((a) => affectedTargets.has(a.target.id)),
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

  // === Lifecycle: Auto mode — play toggle or mode transition ===
  useEffect(() => {
    const justSwitchedToAuto = prevPlayModeRef.current !== 'auto' && playMode === 'auto';
    const justLeftAuto = prevPlayModeRef.current === 'auto' && playMode !== 'auto';
    prevPlayModeRef.current = playMode;

    // auto→off: kill auto timeline, reset elements to initial state
    if (justLeftAuto) {
      cancelPendingRaf();
      killTimeline();
      resetElementStyles(elementRefsMap.current);
      applyInitialStates(versionFilteredAnimations, elementRefsMap.current, spreadContainerRef.current);
      return;
    }

    if (playMode !== 'auto') return;

    if (isPlaying) {
      // Rebuild full timeline when: just switched to auto mode (off→auto),
      // no timeline exists, or phase already complete
      if (justSwitchedToAuto || !timelineRef.current || phase === 'complete') {
        cancelPendingRaf();
        pendingRafRef.current = requestAnimationFrame(() => {
          pendingRafRef.current = null;
          resetElementStyles(elementRefsMap.current);
          applyInitialStates(versionFilteredAnimations, elementRefsMap.current, spreadContainerRef.current);
          buildAndPlayFullTimeline();
        });
      } else {
        timelineRef.current.resume();
        resumePausedMedia();
      }
    } else {
      timelineRef.current?.pause();
      pauseAllMedia();
    }

    return () => {
      cancelPendingRaf();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, playMode]);

  // === Lifecycle: Manual (off) mode pause/resume ===
  useEffect(() => {
    if (playMode !== 'off') return;
    if (isPlaying) {
      timelineRef.current?.resume();
      resumePausedMedia();
    } else {
      timelineRef.current?.pause();
      pauseAllMedia();
    }
  }, [isPlaying, playMode, pauseAllMedia, resumePausedMedia]);

  // === Lifecycle: Volume sync ===
  useEffect(() => {
    const container = spreadContainerRef.current;
    if (!container) return;
    const mediaEls = container.querySelectorAll('audio, video');
    mediaEls.forEach((el) => {
      (el as HTMLMediaElement).volume = effectiveVolume / 100;
    });
  }, [effectiveVolume]);

  // === Lifecycle: Clear active animation orders when playback stops ===
  useEffect(() => {
    if (phase === 'idle' || phase === 'complete' || phase === 'awaiting_next' || phase === 'awaiting_click') {
      usePlaybackStore.getState().setActiveAnimationOrders([]);
    }
  }, [phase]);

  // Resume GSAP timeline after quiz modal closes
  const resumeTimeline = useCallback(() => {
    timelineRef.current?.resume();
  }, []);

  // Called when quiz modal closes — handles both quiz-only steps (no timeline)
  // and mixed steps / auto mode (timeline exists, resume it).
  const handleQuizComplete = useCallback(() => {
    if (timelineRef.current) {
      // Mixed step or auto mode: GSAP callback at +=0.01 removes the quiz order,
      // then timeline.onComplete fires stepComplete.
      timelineRef.current.resume();
    } else {
      // Quiz-only step (manual/off mode): no timeline, clear orders and complete step directly.
      usePlaybackStore.getState().setActiveAnimationOrders([]);
      playbackActions.stepComplete();
    }
  }, [playbackActions]);

  // === Return ===
  return {
    spreadContainerRef,
    registerRef,
    handleClickLoopReplay,
    killTimeline,
    applyStepFinalStates,
    reApplyInitialStates,
    resumeTimeline,
    handleQuizComplete,
  };
}
