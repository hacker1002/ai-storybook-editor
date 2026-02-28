// player-canvas.tsx - Main canvas for player mode with GSAP timeline animations
'use client';

import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  EditableTextbox,
  EditableObject,
  getScaledDimensions,
  getFirstTextboxKey,
  Z_INDEX,
  type Geometry,
  type Typography,
  type Fill,
  type Outline,
} from '../shared';
import { PageItem } from '../canvas-spread-view/page-item';
import type { PlayerCanvasProps, Animation } from './types';
import {
  buildAnimationTween,
  getTimelinePosition,
  resetElementStyles,
  setInitialStates,
} from './gsap-animation-utils';
import { TEXTBOX_Z_INDEX_BASE, EFFECT_TYPE_NAMES } from './constants';

const EMPTY_ANIMATION_DELAY_S = 1.5;

export function PlayerCanvas({
  spread,
  isPlaying,
  volume,
  isMuted,
  onSpreadComplete,
}: PlayerCanvasProps) {
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const elementRefsMap = useRef<Map<string, HTMLElement>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);
  const emptyTimeoutRef = useRef<number | null>(null);

  // Reactive prefers-reduced-motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const { width: scaledWidth, height: scaledHeight } = getScaledDimensions(100);

  // Element registration callback
  const registerElement = useCallback((id: string) => {
    return (el: HTMLElement | null) => {
      if (el) {
        elementRefsMap.current.set(id, el);
      } else {
        elementRefsMap.current.delete(id);
      }
    };
  }, []);

  // Memoized textboxes with resolved language
  const textboxesWithLang = useMemo(() => {
    if (!spread.textboxes) return [];
    return spread.textboxes
      .map((textbox) => {
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
      })
      .filter(Boolean);
  }, [spread.textboxes]);

  // Kill current timeline and clear timeouts
  const killTimeline = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }
    if (emptyTimeoutRef.current) {
      clearTimeout(emptyTimeoutRef.current);
      emptyTimeoutRef.current = null;
    }
  }, []);

  // Build and play GSAP timeline
  const buildAndPlayTimeline = useCallback(() => {
    killTimeline();

    const animations = spread.animations || [];

    // Handle empty animations: 1.5s delay before complete
    if (animations.length === 0) {
      emptyTimeoutRef.current = window.setTimeout(() => {
        onSpreadComplete(spread.id);
      }, EMPTY_ANIMATION_DELAY_S * 1000);
      return;
    }

    // Set initial states BEFORE building timeline
    // Elements with entrance animations start hidden to prevent flash
    setInitialStates(elementRefsMap.current, animations);

    // Sort animations by order
    const sortedAnimations = [...animations].sort((a, b) => a.order - b.order);

    // Create master timeline
    const tl = gsap.timeline({
      paused: true,
      onComplete: () => onSpreadComplete(spread.id),
    });

    // Build tweens for each animation
    sortedAnimations.forEach((anim: Animation) => {
      const el = elementRefsMap.current.get(anim.target.id);
      if (!el) {
        console.warn(`[PlayerCanvas] Target element not found: ${anim.target.id}`);
        return;
      }

      const effectName = EFFECT_TYPE_NAMES[anim.effect.type] || `Unknown(${anim.effect.type})`;
      const durationMs = anim.effect.duration || 500;
      const delayMs = anim.effect.delay || 0;

      const logInfo = {
        order: anim.order,
        target: anim.target.id,
        targetType: anim.target.type,
        effect: effectName,
        duration: `${durationMs}ms`,
        delay: delayMs > 0 ? `${delayMs}ms` : undefined,
        direction: anim.effect.direction,
        loop: anim.effect.loop,
        triggerType: anim.trigger_type,
      };

      const position = getTimelinePosition(anim.trigger_type);
      const tween = buildAnimationTween(el, anim, prefersReducedMotion);

      // Log animation start
      tween.eventCallback('onStart', () => {
        console.log(`[Animation START] #${logInfo.order} "${effectName}" on ${logInfo.targetType}:${logInfo.target}`, logInfo);
      });

      // Log animation complete
      tween.eventCallback('onComplete', () => {
        console.log(`[Animation END] #${logInfo.order} "${effectName}" on ${logInfo.targetType}:${logInfo.target}`);
      });

      tl.add(tween, position);
    });

    timelineRef.current = tl;
    tl.play();
  }, [spread.id, spread.animations, onSpreadComplete, prefersReducedMotion, killTimeline]);

  // GSAP context for auto-cleanup
  useGSAP(
    () => {
      return () => {
        killTimeline();
      };
    },
    { scope: canvasRef }
  );

  // Reset on spread change - defer timeline build to ensure refs populated
  useEffect(() => {
    killTimeline();

    // Clear element styles
    const elements = Array.from(elementRefsMap.current.values());
    if (elements.length > 0) {
      resetElementStyles(elements);
    }

    // Defer build to next frame to ensure DOM refs are populated
    if (isPlaying) {
      requestAnimationFrame(() => {
        if (timelineRef.current === null) {
          buildAndPlayTimeline();
        }
      });
    }
  }, [spread.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle play/pause toggle
  useEffect(() => {
    if (!timelineRef.current) {
      if (isPlaying) {
        buildAndPlayTimeline();
      }
      return;
    }

    if (isPlaying) {
      timelineRef.current.resume();
    } else {
      timelineRef.current.pause();
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Audio volume control
  useEffect(() => {
    const actualVolume = isMuted ? 0 : volume / 100;

    elementRefsMap.current.forEach((el) => {
      if (el instanceof HTMLAudioElement || el instanceof HTMLVideoElement) {
        el.volume = actualVolume;
      }
    });
  }, [volume, isMuted]);

  return (
    <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/30">
      <div
        ref={canvasRef}
        className="relative bg-white shadow-lg"
        style={{
          width: scaledWidth,
          height: scaledHeight,
          willChange: 'transform',
        }}
      >
        {/* Page Backgrounds */}
        {spread.pages.map((page, pageIndex) => (
          <PageItem
            key={pageIndex}
            page={page}
            pageIndex={pageIndex}
            spread={spread}
            spreadId={spread.id}
            position={
              spread.pages.length === 1
                ? 'single'
                : pageIndex === 0
                  ? 'left'
                  : 'right'
            }
            isSelected={false}
            onUpdatePage={() => {}}
            availableLayouts={[]}
          />
        ))}

        {/* Page Divider */}
        {spread.pages.length > 1 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-gray-300"
            style={{ left: '50%', zIndex: Z_INDEX.IMAGE_BASE - 1 }}
          />
        )}

        {/* Objects (wrapped for GSAP ref) */}
        {spread.objects?.map((object, index) => (
          <div key={object.id} ref={registerElement(object.id)}>
            <EditableObject
              object={object}
              index={index}
              isSelected={false}
              isEditable={false}
              onSelect={() => {}}
            />
          </div>
        ))}

        {/* Textboxes (wrapped for GSAP ref) */}
        {textboxesWithLang.map((item, index) => {
          if (!item) return null;
          const { textbox, data } = item;
          return (
            <div key={textbox.id} ref={registerElement(textbox.id)}>
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
    </div>
  );
}

export default PlayerCanvas;
