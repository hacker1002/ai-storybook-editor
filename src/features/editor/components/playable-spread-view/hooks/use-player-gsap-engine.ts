// use-player-gsap-engine.ts - GSAP animation engine hook extracted from PlayerCanvas
// Manages timelines, refs, and all GSAP side effects for playback

import { useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import gsap from 'gsap';
import type { AnimationStep, PlayableSpread } from '@/types/playable-types';
import type { SpreadAnimation } from '@/types/spread-types';
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
  getBaseOpacity,
} from '../player-initial-states';
import { getScaledDimensions } from '../../../utils/coordinate-utils';
import { useCanvasWidth, useCanvasHeight } from '@/stores/editor-settings-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'usePlayerGsapEngine');

// === Helpers ===

/** Resolve audio item media_length for PLAY runtime fallback (animations targeting audio). */
function resolveAudioMediaLength(
  anim: { effect: { type: number }; target: { id: string; type: string } },
  audios: { id: string; media_length?: number }[] | undefined,
): { media_length?: number } {
  if (anim.effect.type !== EFFECT_TYPE.PLAY || anim.target.type !== 'audio') return {};
  const audio = audios?.find((a) => a.id === anim.target.id);
  if (!audio?.media_length) return {};
  return { media_length: audio.media_length };
}

/** Resolve textbox audio data (wordTimings + audioUrl) for READ_ALONG animations */
function resolveReadAlongAudioData(
  anim: { effect: { type: number }; target: { id: string; type: string } },
  textboxes: Record<string, unknown>[] | undefined,
  narrationLangCode: string,
): { wordTimings?: import('@/types/spread-types').WordTiming[]; audioUrl?: string } {
  if (anim.effect.type !== EFFECT_TYPE.READ_ALONG || anim.target.type !== 'textbox') return {};
  const textbox = textboxes?.find((tb) => (tb as { id: string }).id === anim.target.id);
  if (!textbox) return {};
  const result = getTextboxContentForLanguage(textbox as Record<string, unknown>, narrationLangCode);
  const media = result?.content?.audio?.media;
  if (!media) return {};
  const wordTimings = media.segments?.flatMap((seg) => seg.words);
  return { wordTimings, audioUrl: media.url };
}

/**
 * Collect all read-along audio URLs in a spread (regardless of edition filter).
 * Edition filters never strip READ_ALONG animations, so we use spread.animations directly.
 */
function collectReadAlongAudioUrls(
  spread: PlayableSpread | undefined,
  narrationLangCode: string,
): string[] {
  if (!spread) return [];
  const urls = new Set<string>();
  spread.animations?.forEach((anim) => {
    if (anim.effect.type !== EFFECT_TYPE.READ_ALONG) return;
    if (anim.target.type !== 'textbox') return;
    const textbox = spread.textboxes?.find((tb) => tb.id === anim.target.id);
    if (!textbox) return;
    const result = getTextboxContentForLanguage(textbox as Record<string, unknown>, narrationLangCode);
    const url = result?.content?.audio?.media?.url;
    if (url) urls.add(url);
  });
  return Array.from(urls);
}

// === Constants ===
const TRIGGER_DELAY = {
  AFTER_PREVIOUS: 0.5,
  ON_CLICK_AUTO: 1.0,
  FIRST_ANIMATION: 0.5,
  AUTO_SPREAD_COMPLETE: 1.0,
} as const;

/** Defer next-spread audio preload so current spread gets bandwidth priority */
const NEXT_SPREAD_PRELOAD_DELAY_MS = 1000;

// === Hook Interfaces ===

export interface UsePlayerGsapEngineParams {
  spread: PlayableSpread;
  /** Pre-filtered animations by playEdition (from PlayerCanvas prop, not store) */
  filteredAnimations: PlayableSpread['animations'];
  zoomLevel: number;
  narrationLangCode: string;
  onSpreadComplete: (spreadId: string) => void;
  onQuizPlay?: (quizId: string) => void;
  /** Optional: linear next spread for read-along audio preload lookahead */
  nextSpread?: PlayableSpread;
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
  filteredAnimations: editionFilteredAnimations,
  zoomLevel,
  narrationLangCode,
  onSpreadComplete,
  onQuizPlay,
  nextSpread,
}: UsePlayerGsapEngineParams): UsePlayerGsapEngineReturn {
  // === Store Subscriptions ===
  const phase = usePlayerPhase();
  const currentStepIndex = useCurrentStepIndex();
  const playMode = usePlayMode();
  const isPlaying = useIsPlaying();
  const volume = useVolume();
  const isMuted = useIsMuted();
  const playbackActions = usePlaybackActions();
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();

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

  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(canvasWidth, canvasHeight, zoomLevel);

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

  // Clear read-along leftovers (highlight class + dynamically-created orphan audio elements).
  // Centralized so manual Next, USER_BACK, spread change, and unmount all reset cleanly.
  const cleanupReadAlongArtifacts = useCallback(() => {
    const container = spreadContainerRef.current;
    if (!container) return;
    container.querySelectorAll('.read-along-active-word').forEach((el) => {
      el.classList.remove('read-along-active-word');
    });
    container.querySelectorAll<HTMLAudioElement>('audio[style*="display: none"]').forEach((el) => {
      el.pause();
      el.remove();
    });
  }, []);

  const killTimeline = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }
    pauseAllMedia();
    cleanupReadAlongArtifacts();
    usePlaybackStore.getState().clearEffectLoopRemaining();
  }, [pauseAllMedia, cleanupReadAlongArtifacts]);

  const killReplayTimeline = useCallback(() => {
    if (replayTimelineRef.current) {
      replayTimelineRef.current.kill();
      replayTimelineRef.current = null;
    }
    pauseAllMedia();
    cleanupReadAlongArtifacts();
    usePlaybackStore.getState().clearEffectLoopRemaining();
  }, [pauseAllMedia, cleanupReadAlongArtifacts]);

  /** Build the per-animation lifecycle callbacks for addTweenToTimeline.
   *  Seeds eLoop counter on start (finite N>1 only), decrements on repeat,
   *  clears on complete. -1 (infinite) and ≤1 fall through to static display. */
  const buildAnimCallbacks = useCallback((anim: SpreadAnimation) => {
    const loopVal = anim.effect.loop ?? 0;
    const trackable = loopVal > 1;
    return {
      onTweenStart: () => {
        const s = usePlaybackStore.getState();
        s.addActiveAnimationOrder(anim.order);
        if (trackable) s.setEffectLoopRemaining(anim.order, loopVal);
      },
      onTweenRepeat: trackable
        ? () => usePlaybackStore.getState().decrementEffectLoopRemaining(anim.order)
        : undefined,
      onTweenComplete: () => {
        const s = usePlaybackStore.getState();
        s.removeActiveAnimationOrder(anim.order);
        s.clearEffectLoopRemaining(anim.order);
      },
    };
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
        ...(spread.auto_pics || []),
        ...(spread.audios || []),
        ...(spread.quizzes || []),
      ];
      return items.find((i) => i.id === targetId)?.geometry;
    },
    [spread.images, spread.shapes, spread.videos, spread.auto_pics, spread.audios, spread.quizzes]
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
          canvasWidth,
          canvasHeight,
          ...dims,
          ...resolveReadAlongAudioData(anim, spread.textboxes, narrationLangCode),
          ...resolveAudioMediaLength(anim, spread.audios),
          ...buildAnimCallbacks(anim),
        });
      });

      timelineRef.current = tl;
      tl.play();
    },
    [killTimeline, effectiveVolume, playbackActions, getContainerDims, findItemGeometry, onQuizPlay, spread.textboxes, spread.audios, narrationLangCode, canvasWidth, canvasHeight, buildAnimCallbacks]
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
    const animations = [...editionFilteredAnimations].sort((a, b) => a.order - b.order);

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
          const result = getTextboxContentForLanguage(textbox as Record<string, unknown>, narrationLangCode);
          const media = result?.content?.audio?.media;
          if (media) {
            readAlongExtras = {
              wordTimings: media.segments.flatMap((seg) => seg.words),
              audioUrl: media.url,
            };
          }
        }
      }

      addTweenToTimeline(tl, anim, el, position, {
        volume: effectiveVolume / 100,
        spreadContainer: spreadContainerRef.current,
        itemGeometry: findItemGeometry(anim.target.id),
        canvasWidth,
        canvasHeight,
        ...dims,
        ...readAlongExtras,
        ...resolveAudioMediaLength(anim, spread.audios),
        ...buildAnimCallbacks(anim),
      });
    });

    timelineRef.current = tl;
    tl.play();
  }, [killTimeline, effectiveVolume, editionFilteredAnimations, spread.id, onSpreadComplete, getContainerDims, findItemGeometry, onQuizPlay, spread.textboxes, spread.audios, narrationLangCode, canvasWidth, canvasHeight, buildAnimCallbacks]);

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
        const initialProps = resolveInitialState(anim, spreadContainerRef.current, { width: canvasWidth, height: canvasHeight });
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
          canvasWidth,
          canvasHeight,
          ...dims,
          ...resolveReadAlongAudioData(anim, spread.textboxes, narrationLangCode),
          ...resolveAudioMediaLength(anim, spread.audios),
          ...buildAnimCallbacks(anim),
        });
      });

      replayTimelineRef.current = replayTl;
      replayTl.play();
    },
    [killReplayTimeline, effectiveVolume, getContainerDims, findItemGeometry, onQuizPlay, spread.textboxes, spread.audios, narrationLangCode, canvasWidth, canvasHeight, buildAnimCallbacks]
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
        const endState = resolveAnimationEndState(anim, spreadContainerRef.current, findItemGeometry(anim.target.id), { width: canvasWidth, height: canvasHeight }, getBaseOpacity(el));
        if (Object.keys(endState).length > 0) {
          gsap.set(el, endState);
        }
      });
    },
    [findItemGeometry, canvasWidth, canvasHeight]
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
        editionFilteredAnimations.filter((a) => affectedTargets.has(a.target.id)),
        elementRefsMap.current,
        spreadContainerRef.current,
        { width: canvasWidth, height: canvasHeight }
      );

      // Re-apply end states for steps 0..fromStepIndex-1
      for (let i = 0; i < fromStepIndex; i++) {
        steps[i]?.animations.forEach((anim) => {
          const el = elementRefsMap.current.get(anim.target.id);
          if (!el) return;
          const endState = resolveAnimationEndState(
            anim,
            spreadContainerRef.current,
            findItemGeometry(anim.target.id),
            { width: canvasWidth, height: canvasHeight },
            getBaseOpacity(el)
          );
          if (Object.keys(endState).length > 0) gsap.set(el, endState);
        });
      }
    },
    [steps, editionFilteredAnimations, findItemGeometry, canvasWidth, canvasHeight]
  );

  // === Lifecycle: Cleanup on unmount ===
  useLayoutEffect(() => {
    return () => {
      cancelPendingRaf();
      killTimeline();
      killReplayTimeline();
    };
  }, [cancelPendingRaf, killTimeline, killReplayTimeline]);

  // === Lifecycle: Preload read-along narration audio ===
  // Current spread fetched immediately; next spread defers 1s so current gets bandwidth
  // priority if user plays right away. Browser HTTP cache absorbs back-navigation.
  // Audio elements are GC'd via src='' on cleanup; pending fetches aborted.
  useEffect(() => {
    const currentUrls = collectReadAlongAudioUrls(spread, narrationLangCode);
    const nextUrls = collectReadAlongAudioUrls(nextSpread, narrationLangCode)
      .filter((url) => !currentUrls.includes(url));
    if (currentUrls.length === 0 && nextUrls.length === 0) return;

    const preloadUrls = (urls: string[]): HTMLAudioElement[] =>
      urls.map((url) => {
        const a = new Audio();
        a.preload = 'auto';
        a.src = url;
        a.load();
        return a;
      });

    log.debug('preloadReadAlongAudio', 'preloading current', {
      spreadId: spread.id,
      currentCount: currentUrls.length,
      deferredNextCount: nextUrls.length,
    });

    const audios: HTMLAudioElement[] = preloadUrls(currentUrls);

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (nextUrls.length > 0) {
      timeoutId = setTimeout(() => {
        log.debug('preloadReadAlongAudio', 'preloading next (deferred)', {
          spreadId: spread.id,
          count: nextUrls.length,
        });
        audios.push(...preloadUrls(nextUrls));
      }, NEXT_SPREAD_PRELOAD_DELAY_MS);
    }

    return () => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      audios.forEach((a) => {
        a.src = '';
      });
    };
  }, [spread, nextSpread, narrationLangCode]);

  // === Lifecycle: Spread or edition change → kill timelines, reset styles, apply initial states ===
  // NOTE: RESET dispatch (store) is NOT done here — it's done by the parent (PlayerCanvas).
  // editionFilteredAnimations is included so switching editions re-applies correct initial states
  // (e.g. entrance animations set opacity:0; removing them must restore normal opacity).
  useEffect(() => {
    cancelPendingRaf();
    killTimeline();
    killReplayTimeline();
    resetElementStyles(elementRefsMap.current);
    applyInitialStates(editionFilteredAnimations, elementRefsMap.current, spreadContainerRef.current);

    prevStepIndexRef.current = -1;

    // Auto mode: rebuild full timeline on spread/edition change if already playing
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
  }, [spread.id, editionFilteredAnimations]);

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
        editionFilteredAnimations.filter((a) => affectedTargets.has(a.target.id)),
        elementRefsMap.current,
        spreadContainerRef.current,
        { width: canvasWidth, height: canvasHeight }
      );

      // Re-apply end states for steps 0..currentIdx-1
      for (let i = 0; i < currentIdx; i++) {
        steps[i]?.animations.forEach((anim) => {
          const el = elementRefsMap.current.get(anim.target.id);
          if (!el) return;
          const endState = resolveAnimationEndState(
            anim,
            spreadContainerRef.current,
            findItemGeometry(anim.target.id),
            { width: canvasWidth, height: canvasHeight },
            getBaseOpacity(el)
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
      applyInitialStates(editionFilteredAnimations, elementRefsMap.current, spreadContainerRef.current);
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
          applyInitialStates(editionFilteredAnimations, elementRefsMap.current, spreadContainerRef.current);
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
      const s = usePlaybackStore.getState();
      s.setActiveAnimationOrders([]);
      s.clearEffectLoopRemaining();
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
