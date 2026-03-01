// player-canvas.tsx - Main canvas for player mode with GSAP timeline animations
"use client";

import { useRef, useEffect, useMemo, useCallback, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
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
} from "../shared";
import { PageItem } from "../canvas-spread-view/page-item";
import type { PlayerCanvasProps, Animation, PlayMode } from "./types";
import {
  buildAnimationTween,
  resetElementStyles,
  setInitialStates,
} from "./gsap-animation-utils";
import {
  TEXTBOX_Z_INDEX_BASE,
  EFFECT_TYPE_NAMES,
  TRIGGER_DELAY,
} from "./constants";

const EMPTY_ANIMATION_DELAY_S = 1.5;

/**
 * Determines GSAP timeline position string based on trigger type, play mode, and animation index
 */
function getAnimationPosition(
  triggerType: Animation["trigger_type"],
  playMode: PlayMode,
  isFirstAnimation: boolean
): string {
  if (isFirstAnimation) {
    // First animation positioning
    switch (triggerType) {
      case "with_previous":
        return "0"; // Start immediately
      case "after_previous":
        return `+=${TRIGGER_DELAY.FIRST_ANIMATION}`; // 0.5s delay
      case "on_click":
        if (playMode === "off") {
          return "0"; // Will be paused before this animation
        }
        return `+=${TRIGGER_DELAY.ON_CLICK_AUTO}`; // 1s delay in auto/semi-auto
      default:
        return "0";
    }
  }

  // Non-first animation positioning
  switch (triggerType) {
    case "with_previous":
      return "<"; // Concurrent with previous
    case "after_previous":
      return `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`; // 0.5s after previous ends
    case "on_click":
      if (playMode === "off") {
        return `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`; // Position, but timeline pauses before
      }
      return `>+=${TRIGGER_DELAY.ON_CLICK_AUTO}`; // 1s delay in auto/semi-auto
    default:
      return ">";
  }
}

export function PlayerCanvas({
  spread,
  playMode,
  isPlaying,
  volume,
  hasNext,
  onSpreadComplete,
}: PlayerCanvasProps) {
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const elementRefsMap = useRef<Map<string, HTMLElement>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);
  const emptyTimeoutRef = useRef<number | null>(null);

  // Animation control states
  const [isNewPlaying, setIsNewPlaying] = useState(true);
  const [isEndPlaying, setIsEndPlaying] = useState(false);
  const [isWaitingForClick, setIsWaitingForClick] = useState(false);

  // Reactive prefers-reduced-motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
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

  // Build and play GSAP timeline with new trigger logic
  const buildAndPlayTimeline = useCallback(() => {
    killTimeline();
    setIsEndPlaying(false);
    setIsWaitingForClick(false);

    const animations = spread.animations || [];

    // Handle empty animations: 1.5s delay before complete
    if (animations.length === 0) {
      emptyTimeoutRef.current = window.setTimeout(() => {
        setIsEndPlaying(true);
        onSpreadComplete(spread.id);
      }, EMPTY_ANIMATION_DELAY_S * 1000);
      return;
    }

    // Set initial states BEFORE building timeline
    setInitialStates(elementRefsMap.current, animations);

    // Sort animations by order
    const sortedAnimations = [...animations].sort((a, b) => a.order - b.order);

    // Create master timeline
    const tl = gsap.timeline({
      paused: true,
      onComplete: () => {
        setIsEndPlaying(true);
        setIsWaitingForClick(false);
        onSpreadComplete(spread.id);
      },
    });

    // Build tweens for each animation
    sortedAnimations.forEach((anim: Animation, index: number) => {
      const el = elementRefsMap.current.get(anim.target.id);
      if (!el) {
        console.warn(
          `[PlayerCanvas] Target element not found: ${anim.target.id}`
        );
        return;
      }

      const effectName =
        EFFECT_TYPE_NAMES[anim.effect.type] || `Unknown(${anim.effect.type})`;
      const durationMs = anim.effect.duration || 500;
      const delayMs = anim.effect.delay || 0;
      const isFirstAnimation = index === 0;

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

      // Handle on_click pause in 'off' mode
      if (anim.trigger_type === "on_click" && playMode === "off") {
        const pauseLabel = `click_${anim.order}`;

        // Add pause point before this animation
        if (isFirstAnimation) {
          tl.addLabel(pauseLabel, 0);
          tl.addPause(pauseLabel, () => setIsWaitingForClick(true));
        } else {
          // Add label after previous animation ends with small gap
          tl.addLabel(pauseLabel, `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`);
          tl.addPause(pauseLabel, () => setIsWaitingForClick(true));
        }
      }

      const position = getAnimationPosition(
        anim.trigger_type,
        playMode,
        isFirstAnimation
      );
      const tween = buildAnimationTween(el, anim, prefersReducedMotion);

      // Log animation start/complete
      tween.eventCallback("onStart", () => {
        console.log(
          `[Animation START] #${logInfo.order} "${effectName}" on ${logInfo.targetType}:${logInfo.target}`,
          logInfo
        );
      });
      tween.eventCallback("onComplete", () => {
        console.log(
          `[Animation END] #${logInfo.order} "${effectName}" on ${logInfo.targetType}:${logInfo.target}`
        );
      });

      tl.add(tween, position);
    });

    timelineRef.current = tl;
    tl.play();
  }, [
    spread.id,
    spread.animations,
    playMode,
    onSpreadComplete,
    prefersReducedMotion,
    killTimeline,
  ]);

  // Handle canvas click for on_click trigger in 'off' mode
  const handleCanvasClick = useCallback(() => {
    if (playMode !== "off") return;

    const tl = timelineRef.current;
    if (!tl) return;

    // Check if timeline is paused (waiting for click)
    if (tl.paused()) {
      console.log("[PlayerCanvas] Canvas clicked, resuming timeline");
      setIsWaitingForClick(false);
      tl.resume();
    }
  }, [playMode]);

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
    setIsNewPlaying(true);
    setIsEndPlaying(false);
    setIsWaitingForClick(false);

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
          setIsNewPlaying(false);
        }
      });
    }
  }, [spread.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle play/pause toggle
  useEffect(() => {
    if (isPlaying) {
      // Start or resume playback
      if (isNewPlaying || !timelineRef.current) {
        buildAndPlayTimeline();
        setIsNewPlaying(false);
      } else {
        timelineRef.current.resume();
      }
    } else {
      // Pause playback
      if (isEndPlaying) {
        // Animation completed, restart on next play
        setIsNewPlaying(true);
      }
      timelineRef.current?.pause();
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild timeline when playMode changes (trigger delays change)
  useEffect(() => {
    if (timelineRef.current && isPlaying) {
      // Kill and rebuild with new play mode
      buildAndPlayTimeline();
      setIsNewPlaying(false);
    }
  }, [playMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Audio volume control (volume = 0 means muted)
  useEffect(() => {
    const actualVolume = volume / 100;

    elementRefsMap.current.forEach((el) => {
      if (el instanceof HTMLAudioElement || el instanceof HTMLVideoElement) {
        el.volume = actualVolume;
      }
    });
  }, [volume]);

  return (
    <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/30">
      <div
        ref={canvasRef}
        className={`relative bg-white shadow-lg ${
          playMode === "off" ? "cursor-pointer" : ""
        }`}
        style={{
          width: scaledWidth,
          height: scaledHeight,
          willChange: "transform",
        }}
        onClick={handleCanvasClick}
      >
        {/* Click hint badge for on_click in off mode (top-right corner) */}
        {isWaitingForClick && (
          <div className="absolute top-2 right-2 z-500 pointer-events-none">
            <div className="bg-white/90 px-3 py-1.5 rounded-lg shadow-lg border border-gray-200">
              <span className="text-xs font-medium text-gray-700">
                Click to continue
              </span>
            </div>
          </div>
        )}

        {/* Next spread hint badge (top-right corner) - off/semi-auto modes only */}
        {isEndPlaying &&
          hasNext &&
          playMode !== "auto" &&
          !isWaitingForClick && (
            <div className="absolute top-2 right-2 z-500 pointer-events-none">
              <div className="bg-white/90 px-3 py-1.5 rounded-lg shadow-lg border border-gray-200">
                <span className="text-xs font-medium text-gray-700">
                  Press → for next spread
                </span>
              </div>
            </div>
          )}

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
                ? "single"
                : pageIndex === 0
                ? "left"
                : "right"
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
            style={{ left: "50%", zIndex: Z_INDEX.IMAGE_BASE - 1 }}
          />
        )}

        {/* Objects (wrapped for GSAP ref, pointer-events-none to allow click-through) */}
        {spread.objects?.map((object, index) => (
          <div
            key={object.id}
            ref={registerElement(object.id)}
            className="pointer-events-none"
          >
            <EditableObject
              object={object}
              index={index}
              isSelected={false}
              isEditable={false}
              onSelect={() => {}}
            />
          </div>
        ))}

        {/* Textboxes (wrapped for GSAP ref, pointer-events-none to allow click-through) */}
        {textboxesWithLang.map((item, index) => {
          if (!item) return null;
          const { textbox, data } = item;
          return (
            <div
              key={textbox.id}
              ref={registerElement(textbox.id)}
              className="pointer-events-none"
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
    </div>
  );
}

export default PlayerCanvas;
