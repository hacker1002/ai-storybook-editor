// player-canvas.tsx - Animation playback canvas with GSAP engine, 3 play modes, 17 effect types
'use client';

import { useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import gsap from 'gsap';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  EditableTextbox,
  Z_INDEX,
  getScaledDimensions,
  getFirstTextboxKey,
  type Geometry,
  type Typography,
  type Fill,
  type Outline,
} from '../shared';
import { EditableImage, EditableShape, EditableVideo, EditableAudio } from '../canvas-spread-view';
import { PageItem } from '../canvas-spread-view/page-item';
import type { PlayerCanvasProps, AnimationStep } from './types';
import { TEXTBOX_Z_INDEX_BASE, TRIGGER_DELAY } from './constants';
import { usePlayerEngine, isReplayableClick } from './use-player-engine';
import { buildAnimationSteps } from './animation-step-grouping';
import { addTweenToTimeline } from './animation-tween-builders';
import {
  applyInitialStates,
  resetElementStyles,
  resolveInitialState,
  resolveAnimationEndState,
} from './player-initial-states';

// === CSS for click-hint-pulse ===
// IMPORTANT: Apply filter to the CHILD element (> :first-child), not the wrapper div.
// The wrapper div is 0x0 (children are position:absolute with their own geometry).
// CSS filter creates a new containing block, which would break percentage-based
// positioning of position:absolute children if applied to the wrapper.
const CLICK_HINT_STYLE = `
@keyframes click-hint-pulse {
  0%, 100% { filter: drop-shadow(0 0 0px rgba(255, 165, 0, 0)); }
  50% { filter: drop-shadow(0 0 10px rgba(255, 165, 0, 0.7)); }
}
.click-hint-pulse > :first-child {
  animation: click-hint-pulse 1.5s ease-in-out infinite;
}
`;

export function PlayerCanvas({
  spread,
  playMode,
  isPlaying,
  volume,
  hasNext,
  hasPrevious,
  onSpreadComplete,
  onSpreadChange,
  onPlaybackStatusChange,
}: PlayerCanvasProps) {
  // === Hooks & Refs ===
  const { state, dispatch } = usePlayerEngine();
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const replayTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const elementRefsMap = useRef<Map<string, HTMLElement>>(new Map());
  const spreadContainerRef = useRef<HTMLDivElement>(null);
  const prevStepIndexRef = useRef<number>(-1);
  const pendingRafRef = useRef<number | null>(null);
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(100);

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

  const cancelAutoAdvance = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  const registerRef = useCallback((itemId: string) => {
    return (el: HTMLDivElement | null) => {
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
  const findItemGeometry = useCallback((targetId: string): { x: number; y: number } | undefined => {
    const items: Array<{ id: string; geometry: { x: number; y: number } }> = [
      ...(spread.images || []),
      ...(spread.shapes || []),
      ...(spread.videos || []),
      ...(spread.audios || []),
    ];
    return items.find(i => i.id === targetId)?.geometry;
  }, [spread.images, spread.shapes, spread.videos, spread.audios]);

  // === Timeline Builders ===
  const buildAndPlayStepTimeline = useCallback((step: AnimationStep) => {
    killTimeline();
    const tl = gsap.timeline({
      onComplete: () => dispatch({ type: 'STEP_COMPLETE' }),
    });

    const dims = getContainerDims();

    step.animations.forEach((anim, i) => {
      const el = elementRefsMap.current.get(anim.target.id);
      if (!el) {
        console.warn(`[PlayerCanvas] Element not found: ${anim.target.id}`);
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
      });
    });

    timelineRef.current = tl;
    tl.play();
  }, [killTimeline, volume, dispatch, getContainerDims, findItemGeometry]);

  const buildAndPlayFullTimeline = useCallback(() => {
    killTimeline();
    cancelAutoAdvance();
    const tl = gsap.timeline({
      onComplete: () => {
        onSpreadComplete(spread.id);
        if (hasNext) {
          autoAdvanceTimerRef.current = setTimeout(() => {
            autoAdvanceTimerRef.current = null;
            onSpreadChange('next');
          }, TRIGGER_DELAY.AUTO_SPREAD_COMPLETE * 1000);
        }
      },
    });

    const dims = getContainerDims();
    const animations = [...spread.animations].sort((a, b) => a.order - b.order);

    animations.forEach((anim, i) => {
      const el = elementRefsMap.current.get(anim.target.id);
      if (!el) {
        console.warn(`[PlayerCanvas] Element not found: ${anim.target.id}`);
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
      });
    });

    timelineRef.current = tl;
    tl.play();
  }, [killTimeline, cancelAutoAdvance, volume, spread.animations, spread.id, hasNext, onSpreadComplete, onSpreadChange, getContainerDims, findItemGeometry]);

  // === Click Loop Replay (independent timeline) ===
  const handleClickLoopReplay = useCallback((step: AnimationStep) => {
    killReplayTimeline();

    // Emit active indices for sidebar highlight during replay
    if (onPlaybackStatusChange) {
      const indices = step.animations.map((a) => a.order);
      onPlaybackStatusChange({ activeAnimationIndices: indices });
    }

    const replayTl = gsap.timeline({
      onComplete: () => {
        // Clear highlights when replay finishes
        onPlaybackStatusChange?.({ activeAnimationIndices: [] });
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
      });
    });

    replayTimelineRef.current = replayTl;
    replayTl.play();
  }, [killReplayTimeline, volume, getContainerDims, findItemGeometry, onPlaybackStatusChange]);

  // === Lifecycle: Cleanup on unmount ===
  useLayoutEffect(() => {
    return () => {
      cancelPendingRaf();
      cancelAutoAdvance();
      killTimeline();
      killReplayTimeline();
    };
  }, [cancelPendingRaf, cancelAutoAdvance, killTimeline, killReplayTimeline]);

  // === Lifecycle: Spread change → RESET ===
  useEffect(() => {
    cancelPendingRaf();
    cancelAutoAdvance();
    killTimeline();
    killReplayTimeline();
    resetElementStyles(elementRefsMap.current);
    applyInitialStates(spread.animations, elementRefsMap.current, spreadContainerRef.current);

    const steps = buildAnimationSteps(spread.animations);
    dispatch({ type: 'RESET', steps });
    prevStepIndexRef.current = -1;

    // Auto mode: rebuild full timeline on spread change
    if (playMode === 'auto' && isPlaying) {
      pendingRafRef.current = requestAnimationFrame(() => {
        pendingRafRef.current = null;
        buildAndPlayFullTimeline();
      });
    }

    return () => {
      cancelPendingRaf();
      cancelAutoAdvance();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spread.id]);

  // === Lifecycle: Phase change → build timeline (semi-auto) ===
  useEffect(() => {
    if (playMode !== 'semi-auto') return;
    if (state.phase !== 'playing' || state.currentStepIndex < 0) return;

    const currentIdx = state.currentStepIndex;
    const prevIdx = prevStepIndexRef.current;

    // Detect USER_BACK: currentStepIndex decreased
    if (prevIdx >= 0 && currentIdx < prevIdx) {
      // Re-apply: reset affected items, then set end states for steps 0..currentIdx-1
      const affectedTargets = new Set<string>();
      for (let i = currentIdx + 1; i <= prevIdx; i++) {
        state.steps[i]?.animations.forEach((a) => affectedTargets.add(a.target.id));
      }
      affectedTargets.forEach((tid) => {
        const el = elementRefsMap.current.get(tid);
        if (el) gsap.set(el, { clearProps: 'opacity,visibility,transform,transformOrigin' });
      });

      // Re-apply initial states for affected targets
      const allAnimations = spread.animations;
      applyInitialStates(
        allAnimations.filter((a) => affectedTargets.has(a.target.id)),
        elementRefsMap.current,
        spreadContainerRef.current
      );

      // Re-apply end states for steps 0..currentIdx-1
      for (let i = 0; i < currentIdx; i++) {
        state.steps[i]?.animations.forEach((anim) => {
          const el = elementRefsMap.current.get(anim.target.id);
          if (!el) return;
          const endState = resolveAnimationEndState(anim, spreadContainerRef.current, findItemGeometry(anim.target.id));
          if (Object.keys(endState).length > 0) gsap.set(el, endState);
        });
      }
    }

    prevStepIndexRef.current = currentIdx;
    const step = state.steps[currentIdx];
    if (step) buildAndPlayStepTimeline(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.currentStepIndex, playMode]);

  // === Lifecycle: Auto mode — spread change or play toggle ===
  useEffect(() => {
    if (playMode !== 'auto') return;

    if (isPlaying) {
      if (!timelineRef.current || state.phase === 'complete') {
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

  // === Lifecycle: Semi-auto pause ===
  useEffect(() => {
    if (playMode !== 'semi-auto') return;
    if (!isPlaying) {
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

  // === Lifecycle: Emit playback status for sidebar highlight ===
  useEffect(() => {
    if (!onPlaybackStatusChange) return;

    if (state.phase === 'playing' && state.currentStepIndex >= 0) {
      const step = state.steps[state.currentStepIndex];
      if (step) {
        const indices = step.animations.map((a) => a.order);
        onPlaybackStatusChange({ activeAnimationIndices: indices });
        return;
      }
    }
    // Not playing → clear highlights
    onPlaybackStatusChange({ activeAnimationIndices: [] });
  }, [state.phase, state.currentStepIndex, state.steps, onPlaybackStatusChange]);

  // === Navigation Handlers ===
  const handleBack = useCallback(() => {
    if (playMode === 'off') {
      onSpreadChange('prev');
      return;
    }
    if (playMode === 'semi-auto') {
      if (state.currentStepIndex > 0) {
        killTimeline();
        dispatch({ type: 'USER_BACK' });
      } else if (hasPrevious) {
        onSpreadChange('prev');
      }
    }
  }, [playMode, state.currentStepIndex, hasPrevious, onSpreadChange, killTimeline, dispatch]);

  const handleNext = useCallback(() => {
    if (playMode === 'off') {
      onSpreadChange('next');
      return;
    }
    if (playMode === 'semi-auto') {
      if (state.phase === 'complete') {
        if (hasNext) onSpreadChange('next');
      } else {
        killTimeline();
        dispatch({ type: 'USER_NEXT' });
      }
    }
  }, [playMode, state.phase, hasNext, onSpreadChange, killTimeline, dispatch]);

  const handleItemClick = useCallback((itemId: string) => {
    if (playMode !== 'semi-auto') return;

    // Priority 1: main flow pending click
    if (state.pendingClickTargetId === itemId) {
      dispatch({ type: 'USER_CLICK', itemId });
      return;
    }

    // Priority 2: click loop replay (self-handle pattern)
    if (isReplayableClick(state.replayableItems, itemId) && state.phase !== 'playing') {
      const replayable = state.replayableItems.get(itemId);
      if (replayable) {
        const step = state.steps[replayable.stepIndex];
        dispatch({ type: 'CLICK_LOOP_REPLAY', itemId });
        if (step) handleClickLoopReplay(step);
      }
    }
  }, [playMode, state, dispatch, handleClickLoopReplay]);

  // === Pointer & Highlight Logic ===
  const getPointerClasses = useCallback((itemId: string): string => {
    if (playMode === 'semi-auto') {
      if (state.pendingClickTargetId === itemId) return 'pointer-events-auto cursor-pointer';
      if (isReplayableClick(state.replayableItems, itemId)) return 'pointer-events-auto cursor-pointer';
    }
    return 'pointer-events-none';
  }, [playMode, state.pendingClickTargetId, state.replayableItems]);

  const getHighlightClass = useCallback((itemId: string): string => {
    return state.pendingClickTargetId === itemId ? 'click-hint-pulse' : '';
  }, [state.pendingClickTargetId]);

  const canGoBack = useMemo(() => {
    if (playMode === 'off') return hasPrevious;
    if (playMode === 'semi-auto') return state.currentStepIndex > 0 || hasPrevious;
    return false;
  }, [playMode, hasPrevious, state.currentStepIndex]);

  const canGoNext = useMemo(() => {
    if (playMode === 'off') return hasNext;
    if (playMode === 'semi-auto') {
      if (state.phase !== 'complete') return true;
      return hasNext;
    }
    return false;
  }, [playMode, hasNext, state.phase]);

  // === Memoized textboxes with resolved language ===
  const textboxesWithLang = useMemo(() => {
    if (!spread.textboxes) return [];
    return spread.textboxes.map((textbox) => {
      const langKey = getFirstTextboxKey(textbox);
      if (!langKey) return null;
      const data = textbox[langKey] as {
        text: string;
        geometry: Geometry;
        typography: Typography;
        fill?: Fill;
        outline?: Outline;
      };
      if (!data?.geometry) return null;
      return { textbox, langKey, data };
    }).filter(Boolean);
  }, [spread.textboxes]);

  // === Render ===
  return (
    <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/30">
      {/* Inject pulse animation CSS */}
      <style>{CLICK_HINT_STYLE}</style>

      {/* Spread container */}
      <div
        ref={spreadContainerRef}
        className="relative bg-white shadow-lg"
        style={{ width: scaledWidth, height: scaledHeight, willChange: 'transform' }}
      >
        {/* Pages */}
        {spread.pages.map((page, pageIndex) => (
          <PageItem
            key={pageIndex}
            page={page}
            pageIndex={pageIndex}
            spread={spread}
            spreadId={spread.id}
            position={spread.pages.length === 1 ? 'single' : pageIndex === 0 ? 'left' : 'right'}
            isSelected={false}
            onUpdatePage={() => {}}
            availableLayouts={[]}
          />
        ))}

        {/* Page divider */}
        {spread.pages.length > 1 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-300"
            style={{ left: '50%', zIndex: Z_INDEX.IMAGE_BASE - 1 }}
          />
        )}

        {/* Images */}
        {spread.images?.map((image, index) => {
          if (image.player_visible === false) return null;
          return (
            <div
              key={image.id}
              ref={registerRef(image.id)}
              className={`${getPointerClasses(image.id)} ${getHighlightClass(image.id)}`}
              onClickCapture={() => handleItemClick(image.id)}
            >
              <EditableImage
                image={image}
                index={index}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            </div>
          );
        })}

        {/* Shapes */}
        {spread.shapes?.map((shape, index) => {
          if (shape.player_visible === false) return null;
          return (
            <div
              key={shape.id}
              ref={registerRef(shape.id)}
              className={`${getPointerClasses(shape.id)} ${getHighlightClass(shape.id)}`}
              onClickCapture={() => handleItemClick(shape.id)}
            >
              <EditableShape
                shape={shape}
                index={index}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            </div>
          );
        })}

        {/* Videos */}
        {spread.videos?.map((video, index) => {
          if (video.player_visible === false) return null;
          return (
            <div
              key={video.id}
              ref={registerRef(video.id)}
              className={`${getPointerClasses(video.id)} ${getHighlightClass(video.id)}`}
              onClickCapture={() => handleItemClick(video.id)}
            >
              <EditableVideo
                video={video}
                index={index}
                isSelected={false}
                isEditable={false}
                onSelect={() => {}}
              />
            </div>
          );
        })}

        {/* Audios */}
        {spread.audios?.map((audio, index) => {
          if (audio.player_visible === false) return null;
          return (
            <div
              key={audio.id}
              ref={registerRef(audio.id)}
              className={`${getPointerClasses(audio.id)} ${getHighlightClass(audio.id)}`}
              onClickCapture={() => handleItemClick(audio.id)}
            >
              <EditableAudio
                audio={audio}
                index={index}
                isSelected={false}
                isEditable={false}
                isThumbnail={false}
                onSelect={() => {}}
              />
            </div>
          );
        })}

        {/* Textboxes */}
        {textboxesWithLang.map((item, index) => {
          if (!item) return null;
          const { textbox, data } = item;
          return (
            <div
              key={textbox.id}
              ref={registerRef(textbox.id)}
              className={`${getPointerClasses(textbox.id)} ${getHighlightClass(textbox.id)}`}
              onClickCapture={() => handleItemClick(textbox.id)}
            >
              <EditableTextbox
                text={data.text}
                geometry={data.geometry}
                typography={data.typography}
                fill={data.fill}
                outline={data.outline}
                index={index}
                zIndex={TEXTBOX_Z_INDEX_BASE + index}
                isSelected={false}
                isSelectable={false}
                isEditable={false}
                onSelect={() => {}}
                onTextChange={() => {}}
                onEditingChange={() => {}}
              />
            </div>
          );
        })}
      </div>

      {/* Navigation Sidebar (off + semi-auto only) */}
      {playMode !== 'auto' && (
        <div className="flex flex-col gap-2 ml-4">
          <button
            type="button"
            onClick={handleBack}
            disabled={!canGoBack}
            className="p-2 rounded-full bg-white shadow-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext}
            className="p-2 rounded-full bg-white shadow-md hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
