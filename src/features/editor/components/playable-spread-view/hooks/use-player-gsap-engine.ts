// use-player-gsap-engine.ts - GSAP animation engine hook extracted from PlayerCanvas
// Manages timelines, refs, and all GSAP side effects for playback

import { useRef, useEffect, useLayoutEffect, useCallback } from "react";
import gsap from "gsap";
import type {
  AnimationStep,
  PlayableSpread,
  PlayEdition,
} from "@/types/playable-types";
import type { SpreadAnimation } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import {
  usePlaybackStore,
  usePlayerPhase,
  useCurrentStepIndex,
  usePlayMode,
  useIsPlaying,
  usePlaybackActions,
  useAutoplaySuspended,
  useLifecycle,
  guardedGetState,
} from "@/stores/animation-playback-store";
import { addTweenToTimeline } from "../animation-tween-builders";
import { buildMasterTimeline } from "../build-master-timeline";
import { TRIGGER_DELAY as SHARED_TRIGGER_DELAY } from "../linearize-spread-timeline";
import { restoreBaseRotation } from "../restore-base-rotation";
import {
  addCameraTweenToTimeline,
  applyCameraEndState,
} from "../camera-tween-helpers";
import { resolveAnimationTarget } from "@/features/editor/utils/composite-resolve-helpers";
import { getTextboxContentForLanguage } from "../../../utils/textbox-helpers";
import {
  applyInitialStates,
  resetElementStyles,
  resolveInitialState,
  resolveAnimationEndState,
  getBaseOpacity,
} from "../player-initial-states";
import { getScaledDimensions } from "../../../utils/coordinate-utils";
import {
  useCanvasWidth,
  useCanvasHeight,
} from "@/stores/editor-settings-store";
import { usePlayerAudioStore } from "@/stores/player-audio-store";
import { createLogger } from "@/utils/logger";

const log = createLogger("Editor", "usePlayerGsapEngine");

// === Helpers ===

/** Collect resolved target IDs of animations that share a start time with
 *  `animations[currentIdx]` — i.e. the contiguous `with_previous` cluster
 *  bounded on the left by an after_previous/on_next anim and on the right
 *  by the next non-with_previous anim. Composite targets are resolved to
 *  their active variantId so the IDs match `[data-item-id]` in the DOM.
 *  Returns IDs of OTHER cluster members (excluding current). Used by camera
 *  Focus to keep concurrently-animated items un-blurred. */
function collectConcurrentTargetIds(
  animations: ReadonlyArray<SpreadAnimation>,
  currentIdx: number,
  composites: PlayableSpread["composites"],
  playEdition: PlayEdition
): string[] {
  let start = currentIdx;
  while (start > 0 && animations[start].trigger_type === "with_previous")
    start--;
  let end = currentIdx;
  while (
    end + 1 < animations.length &&
    animations[end + 1].trigger_type === "with_previous"
  )
    end++;

  const ids: string[] = [];
  for (let j = start; j <= end; j++) {
    if (j === currentIdx) continue;
    const a = animations[j];
    if (a.target.type === "composite") {
      const r = resolveAnimationTarget(a.target, { composites }, playEdition);
      if (r.variantId) ids.push(r.variantId);
    } else {
      ids.push(a.target.id);
    }
  }
  return ids;
}

/** Resolve audio item media_length for PLAY runtime fallback (animations targeting audio). */
function resolveAudioMediaLength(
  anim: { effect: { type: number }; target: { id: string; type: string } },
  audios: { id: string; media_length?: number }[] | undefined
): { media_length?: number } {
  if (anim.effect.type !== EFFECT_TYPE.PLAY || anim.target.type !== "audio")
    return {};
  const audio = audios?.find((a) => a.id === anim.target.id);
  if (!audio?.media_length) return {};
  return { media_length: audio.media_length };
}

/** Resolve textbox audio data (wordTimings + audioUrl) for READ_ALONG animations */
function resolveReadAlongAudioData(
  anim: { effect: { type: number }; target: { id: string; type: string } },
  textboxes: Record<string, unknown>[] | undefined,
  narrationLangCode: string
): {
  wordTimings?: import("@/types/spread-types").WordTiming[];
  audioUrl?: string;
} {
  if (
    anim.effect.type !== EFFECT_TYPE.READ_ALONG ||
    anim.target.type !== "textbox"
  )
    return {};
  const textbox = textboxes?.find(
    (tb) => (tb as { id: string }).id === anim.target.id
  );
  if (!textbox) return {};
  const result = getTextboxContentForLanguage(
    textbox as Record<string, unknown>,
    narrationLangCode
  );
  const audio = result?.content?.audio;
  if (!audio?.combined_audio_url) return {};
  return {
    wordTimings: audio.word_timings,
    audioUrl: audio.combined_audio_url,
  };
}

// === Constants ===
// Shared keys (AFTER_PREVIOUS, ON_CLICK_AUTO) come from the analytic linearizer —
// the single source of truth that build-master-timeline + audio sequencing also
// use, so the live engine can never drift from the render timing. FIRST_ANIMATION
// and AUTO_SPREAD_COMPLETE are player-only pacing (no analytic-model equivalent).
const TRIGGER_DELAY = {
  ...SHARED_TRIGGER_DELAY,
  FIRST_ANIMATION: 0.5,
  AUTO_SPREAD_COMPLETE: 1.0,
} as const;

// === Hook Interfaces ===

export interface UsePlayerGsapEngineParams {
  spread: PlayableSpread;
  /** Pre-filtered animations by playEdition (from PlayerCanvas prop, not store) */
  filteredAnimations: PlayableSpread["animations"];
  /** Active edition — sourced from PlayerCanvas prop to stay in sync with
   *  filteredAnimations. Reading via `usePlayEdition()` here would lag the prop
   *  by one tick (store sync runs in a separate effect), causing initial-state
   *  for composite targets to resolve against the wrong variant on mount. */
  playEdition: PlayEdition;
  zoomLevel: number;
  narrationLangCode: string;
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
  filteredAnimations: editionFilteredAnimations,
  playEdition,
  zoomLevel,
  narrationLangCode,
  onSpreadComplete,
  onQuizPlay,
}: UsePlayerGsapEngineParams): UsePlayerGsapEngineReturn {
  // === Store Subscriptions ===
  const lifecycle = useLifecycle();
  const phase = usePlayerPhase();
  const currentStepIndex = useCurrentStepIndex();
  const playMode = usePlayMode();
  const isPlaying = useIsPlaying();
  const playbackActions = usePlaybackActions();
  // Autoplay suspended flag — driven by `useSpreadTurnTransition`. While true,
  // we skip kicking off NEW timelines (rebuild on spread change, manual step
  // play, auto play resume) so the GSAP timeline for the incoming spread does
  // not start until the visual page-turn completes. We still allow cleanup +
  // applyInitialStates so the new spread's DOM is ready underneath the overlay.
  const autoplaySuspended = useAutoplaySuspended();
  // playEdition is now received as a hook param (see UsePlayerGsapEngineParams).
  // Reading from the store would lag the parent's prop by one tick — composite
  // targets would resolve against the previous edition's variant on mount.
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight();

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

  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(
    canvasWidth,
    canvasHeight,
    zoomLevel
  );

  // === Helpers ===

  // BGM auto-audio (data-auto-audio="true") owns its own lifecycle per
  // playable-spread-view spec — never pause/resume it from the GSAP engine.
  // Pooled <audio> elements are detached from DOM so the container query won't
  // find them; the store's pauseAllPooledAudio() returns the just-paused list
  // which we add to pausedMediaRef so resumePausedMedia restores them.
  const pauseAllMedia = useCallback(() => {
    const container = spreadContainerRef.current;
    if (!container) return;
    pausedMediaRef.current.clear();
    container
      .querySelectorAll<HTMLMediaElement>("audio:not([data-auto-audio]), video")
      .forEach((el) => {
        if (!el.paused) {
          pausedMediaRef.current.add(el);
          el.pause();
        }
      });
    for (const el of usePlayerAudioStore.getState().pauseAllPooledAudio()) {
      pausedMediaRef.current.add(el);
    }
  }, []);

  /** Resume media elements that were playing before the last pauseAllMedia() call.
   *  Pool elements are detached (isConnected === false) but still playable, so
   *  the connection check is intentionally omitted. */
  const resumePausedMedia = useCallback(() => {
    pausedMediaRef.current.forEach((el) => {
      el.play().catch(() => {});
    });
    pausedMediaRef.current.clear();
  }, []);

  // Clear read-along leftovers — only highlight class. Audio elements are
  // pool-owned (detached from DOM) and never need to be removed here; their
  // pause is handled by pauseAllMedia + the tween's natural-end cleanup.
  const cleanupReadAlongArtifacts = useCallback(() => {
    const container = spreadContainerRef.current;
    if (!container) return;
    container.querySelectorAll(".read-along-active-word").forEach((el) => {
      el.classList.remove("read-along-active-word");
    });
  }, []);

  const killTimeline = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }
    pauseAllMedia();
    cleanupReadAlongArtifacts();
    guardedGetState()?.clearEffectLoopRemaining();
  }, [pauseAllMedia, cleanupReadAlongArtifacts]);

  const killReplayTimeline = useCallback(() => {
    if (replayTimelineRef.current) {
      replayTimelineRef.current.kill();
      replayTimelineRef.current = null;
    }
    pauseAllMedia();
    cleanupReadAlongArtifacts();
    guardedGetState()?.clearEffectLoopRemaining();
  }, [pauseAllMedia, cleanupReadAlongArtifacts]);

  /** Build the per-animation lifecycle callbacks for addTweenToTimeline.
   *  Seeds eLoop counter on start (finite N>1 only), decrements on repeat,
   *  clears on complete. -1 (infinite) and ≤1 fall through to static display. */
  const buildAnimCallbacks = useCallback((anim: SpreadAnimation) => {
    const loopVal = anim.effect.loop ?? 0;
    const trackable = loopVal > 1;
    return {
      onTweenStart: () => {
        const s = guardedGetState();
        if (!s) return;
        s.addActiveAnimationOrder(anim.order);
        if (trackable) s.setEffectLoopRemaining(anim.order, loopVal);
      },
      onTweenRepeat: trackable
        ? () => guardedGetState()?.decrementEffectLoopRemaining(anim.order)
        : undefined,
      onTweenComplete: () => {
        const s = guardedGetState();
        if (!s) return;
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
    [
      spread.images,
      spread.shapes,
      spread.videos,
      spread.auto_pics,
      spread.audios,
      spread.quizzes,
    ]
  );

  // === Timeline Builders ===

  const buildAndPlayStepTimeline = useCallback(
    (step: AnimationStep) => {
      killTimeline();
      guardedGetState()?.setActiveAnimationOrders([]);

      // Quiz-only step: bypass GSAP timeline entirely.
      // tl.call() + tl.addPause() with zero-duration timelines is unreliable —
      // GSAP may fire onComplete immediately or skip the pause.
      // Handle quiz PLAY synchronously instead.
      const isQuizOnlyStep = step.animations.every(
        (a) => a.effect.type === EFFECT_TYPE.PLAY && a.target.type === "quiz"
      );

      if (isQuizOnlyStep) {
        log.debug(
          "buildAndPlayStepTimeline",
          "quiz-only step — skipping GSAP timeline",
          {
            animCount: step.animations.length,
          }
        );
        timelineRef.current = null;
        step.animations.forEach((anim) => {
          guardedGetState()?.addActiveAnimationOrder(anim.order);
          onQuizPlay?.(anim.target.id);
        });
        // stepComplete is called by handleQuizComplete when modal closes
        return;
      }

      const tl = gsap.timeline({
        onComplete: () => playbackActions.stepComplete(),
      });

      const dims = getContainerDims();

      // Track each anim's first-tween start time so `with_previous` resolves to
      // the SAME start as its predecessor — even when the predecessor adds
      // multiple timeline children (camera adds 2: ease-in + revert set).
      // Plain GSAP `'<'` references the most recently inserted child, which
      // for camera is the revert at duration end — wrong anchor for parallel anims.
      const animStartTimes: number[] = [];
      const resolveWithPrevious = (idx: number): number | string => {
        if (idx <= 0) return 0;
        const prev = animStartTimes[idx - 1];
        return prev !== undefined ? prev : "<";
      };
      const recordAnimStart = (idx: number, childrenBefore: number) => {
        const all = tl.getChildren();
        if (all.length > childrenBefore) {
          animStartTimes[idx] = all[childrenBefore].startTime();
        } else {
          animStartTimes[idx] = tl.duration();
        }
      };

      step.animations.forEach((anim, i) => {
        // Quiz PLAY in a mixed step: pause timeline and invoke callback
        if (
          anim.effect.type === EFFECT_TYPE.PLAY &&
          anim.target.type === "quiz"
        ) {
          let position: number | string;
          if (i === 0) position = 0;
          else if (anim.trigger_type === "with_previous")
            position = resolveWithPrevious(i);
          else position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;
          const childrenBefore = tl.getChildren().length;
          tl.call(
            () => {
              guardedGetState()?.addActiveAnimationOrder(anim.order);
              onQuizPlay?.(anim.target.id);
            },
            undefined,
            position
          );
          tl.addPause();
          tl.call(
            () => guardedGetState()?.removeActiveAnimationOrder(anim.order),
            undefined,
            "+=0.01"
          );
          recordAnimStart(i, childrenBefore);
          return;
        }

        // Camera animations (Focus 18, Zoom In 19) — early-branch BEFORE composite resolve.
        // For Focus on a composite target, resolve to the active variantId so siblings
        // exclude the visible variant (not the composite group itself).
        if (
          anim.effect.type === EFFECT_TYPE.FOCUS ||
          anim.effect.type === EFFECT_TYPE.ZOOM_IN
        ) {
          let position: number | string;
          if (i === 0) position = 0;
          else if (anim.trigger_type === "with_previous")
            position = resolveWithPrevious(i);
          else position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;

          let resolvedId: string | undefined = anim.target.id;
          if (
            anim.effect.type === EFFECT_TYPE.FOCUS &&
            anim.target.type === "composite"
          ) {
            const r = resolveAnimationTarget(
              anim.target,
              { composites: spread.composites },
              playEdition
            );
            if (!r.variantId) {
              log.debug(
                "camera.focus.composite",
                "no variant for edition — skip",
                {}
              );
              return;
            }
            resolvedId = r.variantId;
          }
          const cbs = buildAnimCallbacks(anim);
          // Concurrent (with_previous cluster) anims' targets must be excluded from
          // Focus blur so a parallel Fly In / second Focus doesn't dim its own item.
          const excludeIds = collectConcurrentTargetIds(
            step.animations,
            i,
            spread.composites,
            playEdition
          );
          const childrenBefore = tl.getChildren().length;
          addCameraTweenToTimeline(
            tl,
            anim,
            spreadContainerRef.current,
            position,
            resolvedId,
            {
              onStart: cbs.onTweenStart,
              onComplete: cbs.onTweenComplete,
              excludeIds,
            }
          );
          recordAnimStart(i, childrenBefore);
          log.debug("buildAndPlayStepTimeline", "camera tween added", {
            effectType: anim.effect.type,
            target: anim.target.id,
            excludeCount: excludeIds.length,
          });
          return;
        }

        // Phase 6 — composite target → resolve to active variant id under
        // current playEdition. Non-composite targets pass through unchanged.
        // Pass narrow `{ composites }` shape so the callback's effect deps stay
        // narrow (re-create only when composites change, not on any spread edit).
        const resolved = resolveAnimationTarget(
          anim.target,
          { composites: spread.composites },
          playEdition
        );
        if (!resolved.variantId) {
          log.debug(
            "buildAndPlayStepTimeline",
            "composite target unresolved — skipping",
            {
              targetId: anim.target.id,
              targetType: anim.target.type,
              playEdition,
            }
          );
          return;
        }
        const el = elementRefsMap.current.get(resolved.variantId);
        if (!el) {
          log.warn("buildAndPlayStepTimeline", "element not found", {
            targetId: resolved.variantId,
          });
          return;
        }

        let position: number | string;
        if (i === 0) {
          position = 0;
        } else if (anim.trigger_type === "with_previous") {
          position = resolveWithPrevious(i);
        } else {
          // after_previous
          position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;
        }

        const childrenBefore = tl.getChildren().length;
        addTweenToTimeline(tl, anim, el, position, {
          spreadContainer: spreadContainerRef.current,
          itemGeometry: findItemGeometry(resolved.variantId),
          canvasWidth,
          canvasHeight,
          ...dims,
          ...resolveReadAlongAudioData(
            anim,
            spread.textboxes,
            narrationLangCode
          ),
          ...resolveAudioMediaLength(anim, spread.audios),
          ...buildAnimCallbacks(anim),
          bypassMotion: resolved.bypassMotion,
        });
        recordAnimStart(i, childrenBefore);
      });

      timelineRef.current = tl;
      tl.play();
    },
    // Narrow deps: only the spread fields the callback actually reads —
    // resolveAnimationTarget needs `composites`; READ_ALONG/audio fallback need
    // `textboxes`/`audios`. Whole-spread dep would re-create the callback on
    // unrelated field changes (e.g. a stages edit) and re-trigger downstream
    // memos.
    [
      killTimeline,
      playbackActions,
      getContainerDims,
      findItemGeometry,
      onQuizPlay,
      spread.composites,
      spread.textboxes,
      spread.audios,
      narrationLangCode,
      canvasWidth,
      canvasHeight,
      buildAnimCallbacks,
      playEdition,
    ]
  );

  const buildAndPlayFullTimeline = useCallback(() => {
    killTimeline();
    guardedGetState()?.setActiveAnimationOrders([]);
    const dims = getContainerDims();

    // Behaviour-preserving swap (ADR-035 Phase 04): the auto-mode timeline is now
    // built by the SHARED buildMasterTimeline({mode:'live-auto'}) — the same
    // builder the Remotion render drives — so preview === output by construction.
    // Position / pacing-delay / quiz-pause / camera / with_previous logic is
    // identical (proven by the Phase 01 dev-harness identity gate). Interactive
    // step + click-loop replay paths are intentionally NOT touched.
    const tl = buildMasterTimeline({
      animations: editionFilteredAnimations,
      refsMap: elementRefsMap.current,
      container: spreadContainerRef.current,
      containerWidth: dims.containerWidth,
      containerHeight: dims.containerHeight,
      canvasWidth,
      canvasHeight,
      composites: spread.composites,
      textboxes: spread.textboxes,
      audios: spread.audios,
      narrationLangCode,
      playEdition,
      findItemGeometry,
      mode: "live-auto",
      onComplete: () => {
        // Root component handles auto-advance; we only signal completion
        onSpreadComplete(spread.id);
      },
      buildCallbacks: buildAnimCallbacks,
      onQuizPlay,
      setQuizActiveOrder: (order, active) => {
        const s = guardedGetState();
        if (!s) return;
        if (active) s.addActiveAnimationOrder(order);
        else s.removeActiveAnimationOrder(order);
      },
    });

    timelineRef.current = tl;
    tl.play();
    // Narrow deps: only the spread fields the callback reads — `id` for the
    // onSpreadComplete callback, `composites` for resolveAnimationTarget,
    // `textboxes` for READ_ALONG, `audios` for PLAY runtime fallback.
  }, [
    killTimeline,
    editionFilteredAnimations,
    spread.id,
    spread.composites,
    spread.textboxes,
    spread.audios,
    onSpreadComplete,
    getContainerDims,
    findItemGeometry,
    onQuizPlay,
    narrationLangCode,
    canvasWidth,
    canvasHeight,
    buildAnimCallbacks,
    playEdition,
  ]);

  // === Click Loop Replay (independent timeline) ===

  const handleClickLoopReplay = useCallback(
    (step: AnimationStep) => {
      killReplayTimeline();
      guardedGetState()?.setActiveAnimationOrders([]);

      const replayTl = gsap.timeline({
        onComplete: () => {
          // Clear active orders when replay finishes
          guardedGetState()?.setActiveAnimationOrders([]);
        },
      });
      const dims = getContainerDims();

      step.animations.forEach((anim, i) => {
        // Quiz PLAY: invoke callback instead of addTweenToTimeline (same as playStep)
        if (
          anim.effect.type === EFFECT_TYPE.PLAY &&
          anim.target.type === "quiz"
        ) {
          let position: number | string;
          if (i === 0) position = 0;
          else if (anim.trigger_type === "with_previous") position = "<";
          else position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;
          replayTl.call(
            () => {
              guardedGetState()?.addActiveAnimationOrder(anim.order);
              onQuizPlay?.(anim.target.id);
            },
            undefined,
            position
          );
          // No addPause in replay — just clear highlight after quiz callback
          replayTl.call(() =>
            guardedGetState()?.removeActiveAnimationOrder(anim.order)
          );
          return;
        }

        // Camera animations are excluded from click_loop replay (CRUD validation should reject;
        // defensive skip in case legacy data slips through).
        if (
          anim.effect.type === EFFECT_TYPE.FOCUS ||
          anim.effect.type === EFFECT_TYPE.ZOOM_IN
        ) {
          log.warn(
            "handleClickLoopReplay",
            "camera animation skipped (should not click_loop)",
            {
              effectType: anim.effect.type,
            }
          );
          return;
        }

        // Phase 6 — composite resolution for click-loop replay. Narrow shape.
        const resolved = resolveAnimationTarget(
          anim.target,
          { composites: spread.composites },
          playEdition
        );
        if (!resolved.variantId) return;
        const el = elementRefsMap.current.get(resolved.variantId);
        if (!el) return;

        // Clear transforms from previous play, then reset to initial state.
        // Emphasis effects (Spin, Grow/Shrink, Teeter) leave residual rotation/scale;
        // without clearing, absolute tweens (e.g. rotation: 5) would be a no-op.
        gsap.set(el, { clearProps: "transform,transformOrigin" });
        restoreBaseRotation(el);
        const initialProps = resolveInitialState(
          anim,
          spreadContainerRef.current,
          { width: canvasWidth, height: canvasHeight }
        );
        if (Object.keys(initialProps).length > 0) {
          gsap.set(el, initialProps);
        }

        let position: number | string;
        if (i === 0) position = 0;
        else if (anim.trigger_type === "with_previous") position = "<";
        else position = `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;

        addTweenToTimeline(replayTl, anim, el, position, {
          spreadContainer: spreadContainerRef.current,
          itemGeometry: findItemGeometry(resolved.variantId),
          canvasWidth,
          canvasHeight,
          ...dims,
          ...resolveReadAlongAudioData(
            anim,
            spread.textboxes,
            narrationLangCode
          ),
          ...resolveAudioMediaLength(anim, spread.audios),
          ...buildAnimCallbacks(anim),
          bypassMotion: resolved.bypassMotion,
        });
      });

      replayTimelineRef.current = replayTl;
      replayTl.play();
    },
    // Narrow deps — see buildAndPlayStepTimeline note.
    [
      killReplayTimeline,
      getContainerDims,
      findItemGeometry,
      onQuizPlay,
      spread.composites,
      spread.textboxes,
      spread.audios,
      narrationLangCode,
      canvasWidth,
      canvasHeight,
      buildAnimCallbacks,
      playEdition,
    ]
  );

  // === Returned utility functions ===

  /**
   * Apply final GSAP end states for all animations in a step.
   * Used by parent when skipping forward to set visual end state.
   */
  const applyStepFinalStates = useCallback(
    (step: AnimationStep) => {
      step.animations.forEach((anim) => {
        // Camera animations auto-revert — apply spread/sibling reset directly.
        if (
          anim.effect.type === EFFECT_TYPE.FOCUS ||
          anim.effect.type === EFFECT_TYPE.ZOOM_IN
        ) {
          let resolvedId: string | undefined = anim.target.id;
          if (
            anim.effect.type === EFFECT_TYPE.FOCUS &&
            anim.target.type === "composite"
          ) {
            const r = resolveAnimationTarget(
              anim.target,
              { composites: spread.composites },
              playEdition
            );
            resolvedId = r.variantId ?? anim.target.id;
          }
          applyCameraEndState(anim, spreadContainerRef.current, resolvedId);
          return;
        }
        const el = elementRefsMap.current.get(anim.target.id);
        if (!el) return;
        const endState = resolveAnimationEndState(
          anim,
          spreadContainerRef.current,
          findItemGeometry(anim.target.id),
          { width: canvasWidth, height: canvasHeight },
          getBaseOpacity(el)
        );
        if (Object.keys(endState).length > 0) {
          gsap.set(el, endState);
        }
      });
    },
    [
      findItemGeometry,
      canvasWidth,
      canvasHeight,
      spread.composites,
      playEdition,
    ]
  );

  /**
   * Reset visual state of elements affected from fromStepIndex forward,
   * then re-apply end states for all steps before fromStepIndex.
   * Used by parent when navigating backward.
   */
  const reApplyInitialStates = useCallback(
    (fromStepIndex: number) => {
      // Collect targets affected from fromStepIndex forward; also drop any
      // camera side-effects (FOCUS blurs siblings, ZOOM_IN scales the spread
      // container — both live OUTSIDE affectedTargets and would otherwise
      // persist after a back-navigation that interrupts the tween mid-flight.
      const affectedTargets = new Set<string>();
      for (let i = fromStepIndex; i < steps.length; i++) {
        steps[i]?.animations.forEach((a) => {
          affectedTargets.add(a.target.id);
          if (
            a.effect.type === EFFECT_TYPE.FOCUS ||
            a.effect.type === EFFECT_TYPE.ZOOM_IN
          ) {
            let resolvedId: string | undefined = a.target.id;
            if (
              a.effect.type === EFFECT_TYPE.FOCUS &&
              a.target.type === "composite"
            ) {
              const r = resolveAnimationTarget(
                a.target,
                { composites: spread.composites },
                playEdition
              );
              resolvedId = r.variantId ?? a.target.id;
            }
            applyCameraEndState(a, spreadContainerRef.current, resolvedId);
          }
        });
      }

      // Clear GSAP props + read-along highlights for affected elements
      affectedTargets.forEach((tid) => {
        const el = elementRefsMap.current.get(tid);
        if (!el) return;
        gsap.set(el, {
          clearProps: "opacity,visibility,transform,transformOrigin",
        });
        restoreBaseRotation(el);
        el.querySelectorAll(".read-along-active-word").forEach((w) => {
          w.classList.remove("read-along-active-word");
        });
      });

      // Re-apply initial states for affected targets
      applyInitialStates(
        editionFilteredAnimations.filter((a) =>
          affectedTargets.has(a.target.id)
        ),
        elementRefsMap.current,
        spreadContainerRef.current,
        { width: canvasWidth, height: canvasHeight },
        { composites: spread.composites },
        playEdition
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
    [
      steps,
      editionFilteredAnimations,
      findItemGeometry,
      canvasWidth,
      canvasHeight,
      spread.composites,
      playEdition,
    ]
  );

  // === Lifecycle: Cleanup on unmount ===
  useLayoutEffect(() => {
    return () => {
      cancelPendingRaf();
      killTimeline();
      killReplayTimeline();
    };
  }, [cancelPendingRaf, killTimeline, killReplayTimeline]);

  // === Lifecycle: Spread or edition change → kill timelines, reset styles, apply initial states ===
  // NOTE: RESET dispatch (store) is NOT done here — it's done by the parent (PlayerCanvas).
  // editionFilteredAnimations is included so switching editions re-applies correct initial states
  // (e.g. entrance animations set opacity:0; removing them must restore normal opacity).
  useEffect(() => {
    if (lifecycle !== 'ready') return;
    cancelPendingRaf();
    killTimeline();
    killReplayTimeline();
    resetElementStyles(elementRefsMap.current);

    // Camera defensive cleanup — handle spread navigation during a Camera hold phase
    // (transform on spread container or filter/opacity on visual items mid-tween).
    if (spreadContainerRef.current) {
      gsap.set(spreadContainerRef.current, {
        clearProps: "transform,transformOrigin",
      });
      const allVisualItems =
        spreadContainerRef.current.querySelectorAll<HTMLElement>(
          "[data-item-id]"
        );
      if (allVisualItems.length > 0) {
        gsap.set(allVisualItems, { clearProps: "filter,opacity" });
      }
    }

    applyInitialStates(
      editionFilteredAnimations,
      elementRefsMap.current,
      spreadContainerRef.current,
      { width: canvasWidth, height: canvasHeight },
      { composites: spread.composites },
      playEdition
    );

    prevStepIndexRef.current = -1;

    // Spread-turn in flight — overlay is masking the new spread, do NOT kick
    // off the full timeline yet. Effect #3 (auto play toggle) will re-fire
    // once `autoplaySuspended` flips back to false at settle and rebuild then.
    if (autoplaySuspended) {
      log.debug("effectSpreadChange", "autoplay suspended — skip rebuild");
      return () => {
        cancelPendingRaf();
      };
    }

    // Auto mode: rebuild full timeline on spread/edition change if already playing
    if (playMode === "auto" && isPlaying) {
      pendingRafRef.current = requestAnimationFrame(() => {
        pendingRafRef.current = null;
        buildAndPlayFullTimeline();
      });
    }

    return () => {
      cancelPendingRaf();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread.id, editionFilteredAnimations, autoplaySuspended, lifecycle]);

  // === Lifecycle: Phase change → build step timeline (manual/off mode) ===
  useEffect(() => {
    if (lifecycle !== 'ready') return;
    if (playMode !== "off") return;
    // Skip step build while a spread-turn is animating; user-driven Next will
    // re-fire this effect on the next phase tick after settle.
    if (autoplaySuspended) {
      log.debug("effectManualPlay", "autoplay suspended — skip step build");
      return;
    }
    if (phase !== "playing" || currentStepIndex < 0) {
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
        gsap.set(el, {
          clearProps: "opacity,visibility,transform,transformOrigin",
        });
        restoreBaseRotation(el);
        // Clear read-along highlights left by killed timeline
        el.querySelectorAll(".read-along-active-word").forEach((w) => {
          w.classList.remove("read-along-active-word");
        });
      });

      // Re-apply initial states for affected targets
      applyInitialStates(
        editionFilteredAnimations.filter((a) =>
          affectedTargets.has(a.target.id)
        ),
        elementRefsMap.current,
        spreadContainerRef.current,
        { width: canvasWidth, height: canvasHeight },
        { composites: spread.composites },
        playEdition
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
  }, [phase, currentStepIndex, playMode, autoplaySuspended, lifecycle]);

  // === Lifecycle: Auto mode — play toggle or mode transition ===
  useEffect(() => {
    if (lifecycle !== 'ready') return;
    const justSwitchedToAuto =
      prevPlayModeRef.current !== "auto" && playMode === "auto";
    const justLeftAuto =
      prevPlayModeRef.current === "auto" && playMode !== "auto";
    prevPlayModeRef.current = playMode;

    // auto→off: kill auto timeline, reset elements to initial state
    if (justLeftAuto) {
      cancelPendingRaf();
      killTimeline();
      resetElementStyles(elementRefsMap.current);
      applyInitialStates(
        editionFilteredAnimations,
        elementRefsMap.current,
        spreadContainerRef.current,
        { width: canvasWidth, height: canvasHeight },
        { composites: spread.composites },
        playEdition
      );
      return;
    }

    if (playMode !== "auto") return;

    // Spread-turn in flight — pause any running timeline + media so audio /
    // animations don't bleed into the flip. When `autoplaySuspended` flips
    // back to false at settle, this effect re-fires and rebuilds normally.
    if (autoplaySuspended) {
      log.debug("effectAutoPlay", "autoplay suspended — pause + skip");
      timelineRef.current?.pause();
      pauseAllMedia();
      return () => {
        cancelPendingRaf();
      };
    }

    if (isPlaying) {
      // Rebuild full timeline when: just switched to auto mode (off→auto),
      // no timeline exists, or phase already complete
      if (justSwitchedToAuto || !timelineRef.current || phase === "complete") {
        cancelPendingRaf();
        pendingRafRef.current = requestAnimationFrame(() => {
          pendingRafRef.current = null;
          resetElementStyles(elementRefsMap.current);
          applyInitialStates(
            editionFilteredAnimations,
            elementRefsMap.current,
            spreadContainerRef.current,
            { width: canvasWidth, height: canvasHeight },
            { composites: spread.composites },
            playEdition
          );
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
  }, [isPlaying, playMode, autoplaySuspended, lifecycle]);

  // === Lifecycle: Manual (off) mode pause/resume ===
  useEffect(() => {
    if (lifecycle !== 'ready') return;
    if (playMode !== "off") return;
    if (isPlaying) {
      timelineRef.current?.resume();
      resumePausedMedia();
    } else {
      timelineRef.current?.pause();
      pauseAllMedia();
    }
  }, [isPlaying, playMode, pauseAllMedia, resumePausedMedia, lifecycle]);

  // === Lifecycle: Clear active animation orders when playback stops ===
  useEffect(() => {
    if (lifecycle !== 'ready') return;
    if (
      phase === "idle" ||
      phase === "complete" ||
      phase === "awaiting_next" ||
      phase === "awaiting_click"
    ) {
      const s = guardedGetState();
      if (!s) return;
      s.setActiveAnimationOrders([]);
      s.clearEffectLoopRemaining();
    }
  }, [phase, lifecycle]);

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
      guardedGetState()?.setActiveAnimationOrders([]);
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
