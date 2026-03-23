// animation-tween-builders.ts - GSAP tween builders for 17 animation effect types

import type { SpreadAnimation, WordTiming } from "@/types/spread-types";
import { CANVAS } from "@/constants/spread-constants";
import { EFFECT_TYPE, EFFECT_TYPE_NAMES } from "@/constants/playable-constants";
import {
  calculateFlyOffset,
  calculateFloatOffset,
} from "./player-initial-states";
import { createLogger } from "@/utils/logger";

const log = createLogger('Editor', 'AnimationTweenBuilders');

// === Default Durations (seconds) ===
const DEFAULT_ENTRANCE_DURATION = 0.5;
const DEFAULT_EMPHASIS_DURATION = 0.8;
const DEFAULT_EXIT_DURATION = 0.5;
const DEFAULT_MOTION_DURATION = 1.0;

interface TweenOptions {
  volume?: number;
  spreadContainer?: HTMLElement | null;
  /** Pre-computed container dimensions to avoid repeated getBoundingClientRect calls */
  containerWidth?: number;
  containerHeight?: number;
  /** Item's original geometry position (%) — needed for Lines/Arcs delta calculation */
  itemGeometry?: { x: number; y: number };
  /** Called when any tween in this animation starts — used for sidebar highlight */
  onTweenStart?: () => void;
  /** Called when any tween in this animation completes — used to remove from active list */
  onTweenComplete?: () => void;
  /** Word-level timing data for Read-Along effect */
  wordTimings?: WordTiming[];
  /** Audio URL for Read-Along narration playback */
  audioUrl?: string;
}

/**
 * Add a GSAP tween to a timeline for one SpreadAnimation.
 *
 * @param timeline - GSAP timeline to append to
 * @param animation - The spread animation data
 * @param element - DOM element target
 * @param position - GSAP position parameter (0, "<", ">+=0.5", etc.)
 * @param options - Optional volume and container reference
 */
export function addTweenToTimeline(
  timeline: ReturnType<typeof import("gsap").default.timeline>,
  animation: SpreadAnimation,
  element: HTMLElement,
  position: number | string,
  options?: TweenOptions
): void {
  const { effect } = animation;
  const effectType = effect.type;
  const delaySec = (effect.delay ?? 0) / 1000;
  const targetId = animation.target.id;
  const effectName = EFFECT_TYPE_NAMES[effectType] || `Unknown(${effectType})`;

  // Capture child count before adding tweens — used for attaching start/end logs
  const childCountBefore = timeline.getChildren().length;

  const cw =
    options?.containerWidth ??
    options?.spreadContainer?.getBoundingClientRect().width ??
    CANVAS.BASE_WIDTH;
  const ch =
    options?.containerHeight ??
    options?.spreadContainer?.getBoundingClientRect().height ??
    CANVAS.BASE_HEIGHT;

  switch (effectType) {
    // ── Media Play (1) ──────────────────────────────────────────
    case EFFECT_TYPE.PLAY: {
      const mediaEl = element.querySelector(
        "audio, video"
      ) as HTMLMediaElement | null;
      if (!mediaEl) {
        log.warn('addTweenToTimeline', 'media element not found', { targetId: animation.target.id, effectType });
        return;
      }
      const volume = options?.volume ?? 1;
      const durationSec = (effect.duration ?? 0) / 1000;

      // timeline.call() creates DelayedCall children that don't support eventCallback(),
      // so we fire onTweenStart/onTweenComplete directly inside the lambdas.
      timeline.call(
        () => {
          options?.onTweenStart?.();
          try {
            mediaEl.currentTime = 0;
            mediaEl.volume = volume;
            if (effect.loop && effect.loop > 0) mediaEl.loop = true;
            mediaEl.play().catch(() => {
              log.warn('addTweenToTimeline', 'autoplay blocked', { targetId: animation.target.id });
            });
          } catch {
            log.warn('addTweenToTimeline', 'media play error', { targetId: animation.target.id });
          }
        },
        undefined,
        position as number | string
      );

      // Pause after duration if specified
      if (durationSec > 0) {
        timeline.call(
          () => {
            mediaEl.pause();
            options?.onTweenComplete?.();
          },
          undefined,
          `>+=${durationSec}`
        );
      } else {
        // No duration — complete immediately after play starts
        timeline.call(() => { options?.onTweenComplete?.(); });
      }
      break;
    }

    // ── Appear (2) ───────────────────────────────────────────────
    case EFFECT_TYPE.APPEAR:
      timeline.set(element, { autoAlpha: 1, delay: delaySec }, position);
      break;

    // ── Fade In (3) ──────────────────────────────────────────────
    case EFFECT_TYPE.FADE_IN: {
      const dur = (effect.duration ?? DEFAULT_ENTRANCE_DURATION * 1000) / 1000;
      timeline.to(
        element,
        {
          autoAlpha: 1,
          duration: dur,
          delay: delaySec,
          ease: "power2.out",
        },
        position
      );
      break;
    }

    // ── Fly In (4) ───────────────────────────────────────────────
    case EFFECT_TYPE.FLY_IN: {
      const dur = (effect.duration ?? DEFAULT_ENTRANCE_DURATION * 1000) / 1000;
      // Element starts offscreen (set by applyInitialStates), tween to origin
      timeline.to(
        element,
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          duration: dur,
          delay: delaySec,
          ease: "power2.out",
        },
        position
      );
      break;
    }

    // ── Float In (5) ─────────────────────────────────────────────
    case EFFECT_TYPE.FLOAT_IN: {
      const dur = (effect.duration ?? DEFAULT_ENTRANCE_DURATION * 1000) / 1000;
      timeline.to(
        element,
        {
          autoAlpha: 1,
          x: 0,
          y: 0,
          duration: dur,
          delay: delaySec,
          ease: "power2.out",
        },
        position
      );
      break;
    }

    // ── Zoom (6) ─────────────────────────────────────────────────
    case EFFECT_TYPE.ZOOM: {
      const dur = (effect.duration ?? DEFAULT_ENTRANCE_DURATION * 1000) / 1000;
      const targetScale =
        effect.amount && effect.amount > 0 ? effect.amount : 1;
      timeline.to(
        element,
        {
          autoAlpha: 1,
          scale: targetScale,
          duration: dur,
          delay: delaySec,
          ease: "back.out(1.7)",
          transformOrigin: "center center",
        },
        position
      );
      break;
    }

    // ── Spin (7) ─────────────────────────────────────────────────
    case EFFECT_TYPE.SPIN: {
      const dur = (effect.duration ?? DEFAULT_EMPHASIS_DURATION * 1000) / 1000;
      let rotationDeg = 360 * (effect.amount || 1);
      if (effect.direction === "right") rotationDeg = -rotationDeg;
      // effect.loop = total play count (1 = play once). GSAP repeat = additional plays after first.
      const repeat = effect.loop === -1 ? -1 : Math.max(0, (effect.loop ?? 1) - 1);
      timeline.to(
        element,
        {
          rotation: `+=${rotationDeg}`,
          duration: dur,
          delay: delaySec,
          ease: "power1.inOut",
          repeat,
          transformOrigin: "center center",
        },
        position
      );
      break;
    }

    // ── Grow/Shrink (8) ──────────────────────────────────────────
    case EFFECT_TYPE.GROW_SHRINK: {
      const dur = (effect.duration ?? DEFAULT_EMPHASIS_DURATION * 1000) / 1000;
      const amt = effect.amount ?? 1.2;
      let scaleX = amt;
      let scaleY = amt;
      if (effect.direction === "left" || effect.direction === "right")
        scaleY = 1;
      if (effect.direction === "up" || effect.direction === "down") scaleX = 1;
      timeline.to(
        element,
        {
          scaleX,
          scaleY,
          duration: dur,
          delay: delaySec,
          ease: "power1.inOut",
          transformOrigin: "center center",
        },
        position
      );
      break;
    }

    // ── Teeter (9) ───────────────────────────────────────────────
    case EFFECT_TYPE.TEETER: {
      const dur = (effect.duration ?? DEFAULT_EMPHASIS_DURATION * 1000) / 1000;
      // effect.loop = total play count. GSAP repeat = additional plays after first. Default 4 for teeter.
      const repeatCount =
        effect.loop === -1
          ? -1
          : effect.loop && effect.loop > 0
          ? effect.loop - 1
          : 4;
      timeline.to(
        element,
        {
          rotation: 5,
          duration: dur / 2,
          delay: delaySec,
          yoyo: true,
          repeat: repeatCount,
          ease: "sine.inOut",
          transformOrigin: "center bottom",
        },
        position
      );
      break;
    }

    // ── Transparency (10) ────────────────────────────────────────
    case EFFECT_TYPE.TRANSPARENCY: {
      const dur = (effect.duration ?? DEFAULT_EMPHASIS_DURATION * 1000) / 1000;
      const targetAlpha =
        effect.amount != null && effect.amount >= 0 && effect.amount <= 1
          ? effect.amount
          : 0.5;
      timeline.to(
        element,
        {
          autoAlpha: targetAlpha,
          duration: dur,
          delay: delaySec,
          ease: "power1.inOut",
        },
        position
      );
      break;
    }

    // ── Read-along (11) ──────────────────────────────────────────
    case EFFECT_TYPE.READ_ALONG: {
      const audioUrl = options?.audioUrl;
      if (!audioUrl) {
        log.warn('addTweenToTimeline', 'read-along: no audioUrl provided', { targetId });
        break;
      }

      const volume = options?.volume ?? 1;
      const wordTimings = options?.wordTimings;
      const durationSec = (effect.duration ?? 0) / 1000;

      // Create audio element and attach to DOM so pauseAllMedia() can find it on killTimeline
      const audio = document.createElement('audio');
      audio.src = audioUrl;
      audio.style.display = 'none';
      element.appendChild(audio);

      // Use a unique label for absolute positioning of word timings
      const readAlongLabel = `ra_${targetId}_${Date.now()}`;
      timeline.addLabel(readAlongLabel, position as number | string);

      // Start: play audio
      timeline.call(
        () => {
          options?.onTweenStart?.();
          audio.volume = volume;
          audio.currentTime = 0;
          audio.play().catch(() => {
            log.warn('addTweenToTimeline', 'read-along autoplay blocked', { targetId });
          });
        },
        undefined,
        readAlongLabel
      );

      // Schedule word highlights using label-relative positions
      if (wordTimings && wordTimings.length > 0) {
        const wordSpans = element.querySelectorAll<HTMLElement>('span[data-word-index]');

        wordTimings.forEach((wt, i) => {
          const offsetSec = wt.startMs / 1000;
          timeline.call(
            () => {
              // Remove highlight from previous word
              if (i > 0) {
                const prevSpan = wordSpans[i - 1];
                prevSpan?.classList.remove('read-along-active-word');
              }
              // Add highlight to current word
              const span = wordSpans[i];
              span?.classList.add('read-along-active-word');
            },
            undefined,
            `${readAlongLabel}+=${offsetSec}`
          );
        });
      }

      // End: pause audio + cleanup highlights + remove audio element
      const cleanup = () => {
        audio.pause();
        element.querySelectorAll('.read-along-active-word').forEach((el) => {
          el.classList.remove('read-along-active-word');
        });
        audio.remove();
        options?.onTweenComplete?.();
      };

      if (durationSec > 0) {
        timeline.call(cleanup, undefined, `${readAlongLabel}+=${durationSec}`);
      } else {
        timeline.call(cleanup);
      }
      break;
    }

    // ── Disappear (12) ───────────────────────────────────────────
    case EFFECT_TYPE.DISAPPEAR:
      timeline.set(element, { autoAlpha: 0, delay: delaySec }, position);
      break;

    // ── Fade Out (13) ────────────────────────────────────────────
    case EFFECT_TYPE.FADE_OUT: {
      const dur = (effect.duration ?? DEFAULT_EXIT_DURATION * 1000) / 1000;
      timeline.to(
        element,
        {
          autoAlpha: 0,
          duration: dur,
          delay: delaySec,
          ease: "power2.in",
        },
        position
      );
      break;
    }

    // ── Fly Out (14) ─────────────────────────────────────────────
    case EFFECT_TYPE.FLY_OUT: {
      const dur = (effect.duration ?? DEFAULT_EXIT_DURATION * 1000) / 1000;
      const offset = calculateFlyOffset(effect.direction, cw, ch);
      timeline.to(
        element,
        {
          autoAlpha: 0,
          x: offset.x,
          y: offset.y,
          duration: dur,
          delay: delaySec,
          ease: "power2.in",
        },
        position
      );
      break;
    }

    // ── Float Out (15) ───────────────────────────────────────────
    case EFFECT_TYPE.FLOAT_OUT: {
      const dur = (effect.duration ?? DEFAULT_EXIT_DURATION * 1000) / 1000;
      const offset = calculateFloatOffset(effect.direction);
      timeline.to(
        element,
        {
          autoAlpha: 0,
          x: offset.x,
          y: offset.y,
          duration: dur,
          delay: delaySec,
          ease: "power2.in",
        },
        position
      );
      break;
    }

    // ── Lines (16) ───────────────────────────────────────────────
    case EFFECT_TYPE.LINES: {
      const dur = (effect.duration ?? DEFAULT_MOTION_DURATION * 1000) / 1000;
      const geo = effect.geometry;
      if (!geo) {
        log.warn('addTweenToTimeline', 'lines effect missing geometry', { targetId: animation.target.id });
        return;
      }
      // effect.geometry = absolute target position (%), delta = target - item origin
      const itemGeo = options?.itemGeometry;
      const deltaX = itemGeo
        ? ((geo.x - itemGeo.x) / 100) * cw
        : (geo.x / 100) * cw;
      const deltaY = itemGeo
        ? ((geo.y - itemGeo.y) / 100) * ch
        : (geo.y / 100) * ch;
      timeline.to(
        element,
        {
          x: deltaX,
          y: deltaY,
          duration: dur,
          delay: delaySec,
          ease: "power1.inOut",
        },
        position
      );
      break;
    }

    // ── Arcs (17) — simplified v1 (linear, no bezier) ────────────
    case EFFECT_TYPE.ARCS: {
      const dur = (effect.duration ?? DEFAULT_MOTION_DURATION * 1000) / 1000;
      const geo = effect.geometry;
      if (!geo) {
        log.warn('addTweenToTimeline', 'arcs effect missing geometry', { targetId: animation.target.id });
        return;
      }
      // effect.geometry = absolute target position (%), delta = target - item origin
      const itemGeo = options?.itemGeometry;
      const deltaX = itemGeo
        ? ((geo.x - itemGeo.x) / 100) * cw
        : (geo.x / 100) * cw;
      const deltaY = itemGeo
        ? ((geo.y - itemGeo.y) / 100) * ch
        : (geo.y / 100) * ch;
      // v1: linear path, enhance to bezier later if needed
      timeline.to(
        element,
        {
          x: deltaX,
          y: deltaY,
          duration: dur,
          delay: delaySec,
          ease: "power1.inOut",
        },
        position
      );
      break;
    }

    default:
      log.warn('addTweenToTimeline', 'unknown effect type', { effectType });
      break;
  }

  // PLAY and READ_ALONG effects fire onTweenStart/onTweenComplete inline (DelayedCall doesn't support eventCallback).
  // Skip the generic callback attachment below to avoid duplicate calls.
  if (effectType === EFFECT_TYPE.PLAY || effectType === EFFECT_TYPE.READ_ALONG) return;

  // Attach start/end callbacks to all tweens added by this call.
  // GSAP quirk: timeline.set() (zero-duration tweens) may skip onStart via eventCallback().
  // Track with a flag so onComplete can fire onTweenStart as fallback to ensure store updates.
  const newChildren = timeline.getChildren().slice(childCountBefore);
  for (const child of newChildren) {
    const prevOnStart = child.eventCallback("onStart") as (() => void) | null;
    const prevOnComplete = child.eventCallback("onComplete") as
      | (() => void)
      | null;
    const isInstant = child.duration() === 0;
    let startFired = false;

    child.eventCallback("onStart", () => {
      log.debug('addTweenToTimeline', 'tween start', { effectName, targetId, triggerType: animation.trigger_type });
      startFired = true;
      prevOnStart?.();
      options?.onTweenStart?.();
    });

    child.eventCallback("onComplete", () => {
      if (isInstant && !startFired) {
        log.debug('addTweenToTimeline', 'tween start (instant)', { effectName, targetId, triggerType: animation.trigger_type });
        options?.onTweenStart?.();
      }
      log.debug('addTweenToTimeline', 'tween end', { effectName, targetId, triggerType: animation.trigger_type });
      prevOnComplete?.();
      options?.onTweenComplete?.();
    });
  }
}
