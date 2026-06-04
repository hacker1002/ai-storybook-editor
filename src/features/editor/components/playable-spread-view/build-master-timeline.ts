// build-master-timeline.ts — the shared, clock-agnostic master timeline builder (ADR-035).
//
// Behaviour-preserving EXTRACT of the live engine's `buildAndPlayFullTimeline`
// (use-player-gsap-engine.ts). Position / pacing-delay / with_previous-anchor /
// composite-resolve / camera / quiz logic is COPIED VERBATIM — the only
// difference between live and render is folded into `mode`:
//
//   • quiz PLAY   → live-auto: tl.call + addPause + resume-call
//                   render:    duration spacer (no pause — render can't wait)
//   • PLAY / READ_ALONG → live-auto: addTweenToTimeline (audio.play side-effect +
//                                     read-along polling, exactly as today)
//                          render:    duration spacer (audio is declarative
//                                     <Audio>; read-along is frame-derived)
//   • per-tween callbacks → live-auto: buildCallbacks (active-order/eLoop/audio)
//                           render:    none
//
// The timeline is returned PAUSED so a clock driver (WallClock / FrameSeek) owns
// advancement. The caller owns `applyInitialStates` — keeping it out of the
// builder is what makes the live-auto path byte-identical to the pre-refactor engine.

import gsap from "gsap";
import type { SpreadAnimation, WordTiming } from "@/types/spread-types";
import type { PlayableSpread, PlayEdition } from "@/types/playable-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";
import { addTweenToTimeline } from "./animation-tween-builders";
import { addCameraTweenToTimeline } from "./camera-tween-helpers";
import { resolveAnimationTarget } from "@/features/editor/utils/composite-resolve-helpers";
import { getTextboxContentForLanguage } from "../../utils/textbox-helpers";
import { createLogger } from "@/utils/logger";
import { TRIGGER_DELAY, effectDurationSec } from "./linearize-spread-timeline";
import type { BuildMasterTimelineArgs } from "./play-clock";

const log = createLogger("Editor", "buildMasterTimeline");

// === Pure helpers (mirrors of the engine's local helpers; engine keeps its own
// copies for the interactive step/replay paths — Phase 04 may consolidate). ===

/** Collect resolved target IDs of the `with_previous` cluster around currentIdx
 *  (excluding current) — used by camera Focus to keep concurrently-animated
 *  items un-blurred. Composite targets resolve to their active variantId. */
function collectConcurrentTargetIds(
  animations: ReadonlyArray<SpreadAnimation>,
  currentIdx: number,
  composites: PlayableSpread["composites"],
  playEdition: PlayEdition
): string[] {
  let start = currentIdx;
  while (start > 0 && animations[start].trigger_type === "with_previous") start--;
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

/** PLAY-on-audio media_length fallback (timeline-progression duration). */
function resolveAudioMediaLength(
  anim: SpreadAnimation,
  audios: PlayableSpread["audios"] | undefined
): { media_length?: number } {
  if (anim.effect.type !== EFFECT_TYPE.PLAY || anim.target.type !== "audio")
    return {};
  const audio = audios?.find((a) => a.id === anim.target.id);
  if (!audio?.media_length) return {};
  return { media_length: audio.media_length };
}

/** READ_ALONG textbox → { wordTimings, audioUrl } for word-level highlight. */
function resolveReadAlongAudioData(
  anim: SpreadAnimation,
  textboxes: PlayableSpread["textboxes"] | undefined,
  narrationLangCode: string
): { wordTimings?: WordTiming[]; audioUrl?: string } {
  if (
    anim.effect.type !== EFFECT_TYPE.READ_ALONG ||
    anim.target.type !== "textbox"
  )
    return {};
  const textbox = textboxes?.find((tb) => tb.id === anim.target.id);
  if (!textbox) return {};
  const result = getTextboxContentForLanguage(
    textbox as Record<string, unknown>,
    narrationLangCode
  );
  const audio = result?.content?.audio;
  if (!audio?.combined_audio_url) return {};
  return { wordTimings: audio.word_timings, audioUrl: audio.combined_audio_url };
}

/**
 * Build the master GSAP timeline (paused) for one spread.
 * @returns paused `gsap.core.Timeline` — attach a clock driver, then play()/seek().
 */
export function buildMasterTimeline(
  args: BuildMasterTimelineArgs
): gsap.core.Timeline {
  const {
    animations: rawAnimations,
    refsMap,
    container,
    containerWidth,
    containerHeight,
    canvasWidth,
    canvasHeight,
    composites,
    textboxes,
    audios,
    narrationLangCode,
    playEdition,
    findItemGeometry,
    mode,
    onComplete,
    buildCallbacks,
    onQuizPlay,
    setQuizActiveOrder,
  } = args;

  const tl = gsap.timeline({ paused: true, onComplete });
  const animations = [...rawAnimations].sort((a, b) => a.order - b.order);

  // Resolve `with_previous` via recorded start times so multi-child anims
  // (camera adds 2: ease-in + revert) don't break the "<" anchor — plain GSAP
  // "<" references the most recently inserted child (camera's revert), the wrong
  // anchor for parallel anims.
  const animStartTimes: number[] = [];
  const resolveWithPrevious = (idx: number): number | string => {
    if (idx <= 0) return 0;
    const prev = animStartTimes[idx - 1];
    return prev !== undefined ? prev : "<";
  };
  const recordAnimStart = (idx: number, childrenBefore: number) => {
    const all = tl.getChildren();
    animStartTimes[idx] =
      all.length > childrenBefore ? all[childrenBefore].startTime() : tl.duration();
  };

  // Shared position resolution — identical 4-way branch the live engine used in
  // every item type (quiz / camera / general).
  const resolvePosition = (idx: number, anim: SpreadAnimation): number | string => {
    if (idx === 0) return 0;
    if (anim.trigger_type === "with_previous") return resolveWithPrevious(idx);
    if (anim.trigger_type === "after_previous")
      return `>+=${TRIGGER_DELAY.AFTER_PREVIOUS}`;
    // on_click / on_next in auto mode → pace with ON_CLICK_AUTO
    return `>+=${TRIGGER_DELAY.ON_CLICK_AUTO}`;
  };

  animations.forEach((anim, i) => {
    const position = resolvePosition(i, anim);

    // ── Quiz PLAY ──────────────────────────────────────────────────────────
    if (anim.effect.type === EFFECT_TYPE.PLAY && anim.target.type === "quiz") {
      const childrenBefore = tl.getChildren().length;
      if (mode === "render") {
        // No interaction in render — collapse to a timing spacer.
        const dur = effectDurationSec(anim);
        if (dur > 0) tl.to({}, { duration: dur }, position);
      } else {
        tl.call(
          () => {
            setQuizActiveOrder?.(anim.order, true);
            onQuizPlay?.(anim.target.id);
          },
          undefined,
          position
        );
        tl.addPause();
        // Offset past pause so it only fires after resume.
        tl.call(() => setQuizActiveOrder?.(anim.order, false), undefined, "+=0.01");
      }
      recordAnimStart(i, childrenBefore);
      return;
    }

    // ── Camera (FOCUS 18 / ZOOM_IN 19) — early-branch BEFORE composite resolve. ──
    if (
      anim.effect.type === EFFECT_TYPE.FOCUS ||
      anim.effect.type === EFFECT_TYPE.ZOOM_IN
    ) {
      let resolvedId: string | undefined = anim.target.id;
      if (
        anim.effect.type === EFFECT_TYPE.FOCUS &&
        anim.target.type === "composite"
      ) {
        const r = resolveAnimationTarget(anim.target, { composites }, playEdition);
        if (!r.variantId) {
          log.debug("camera.focus.composite", "no variant for edition — skip", {});
          return;
        }
        resolvedId = r.variantId;
      }
      const cbs = mode === "live-auto" ? buildCallbacks?.(anim) : undefined;
      const excludeIds = collectConcurrentTargetIds(
        animations,
        i,
        composites,
        playEdition
      );
      const childrenBefore = tl.getChildren().length;
      addCameraTweenToTimeline(tl, anim, container, position, resolvedId, {
        onStart: cbs?.onTweenStart,
        onComplete: cbs?.onTweenComplete,
        excludeIds,
      });
      recordAnimStart(i, childrenBefore);
      return;
    }

    // ── Render-mode media (PLAY non-quiz / READ_ALONG) → timing spacer. ──
    // Audio re-emitted declaratively via <Audio>; read-along highlight derived
    // from frame. No DOM tween / audio.play side-effect (not seek-safe).
    if (
      mode === "render" &&
      (anim.effect.type === EFFECT_TYPE.PLAY ||
        anim.effect.type === EFFECT_TYPE.READ_ALONG)
    ) {
      const childrenBefore = tl.getChildren().length;
      const dur = effectDurationSec(anim);
      if (dur > 0) tl.to({}, { duration: dur }, position);
      recordAnimStart(i, childrenBefore);
      return;
    }

    // ── General path — composite resolve + addTweenToTimeline. ──
    const resolved = resolveAnimationTarget(anim.target, { composites }, playEdition);
    if (!resolved.variantId) {
      log.debug("buildMasterTimeline", "composite target unresolved — skipping", {
        targetId: anim.target.id,
        targetType: anim.target.type,
        playEdition,
      });
      return;
    }
    const el = refsMap.get(resolved.variantId);
    if (!el) {
      log.warn("buildMasterTimeline", "element not found", {
        targetId: resolved.variantId,
      });
      return;
    }

    const cbs = mode === "live-auto" ? buildCallbacks?.(anim) : undefined;
    const childrenBefore = tl.getChildren().length;
    addTweenToTimeline(tl, anim, el, position, {
      spreadContainer: container,
      itemGeometry: findItemGeometry(resolved.variantId),
      canvasWidth,
      canvasHeight,
      containerWidth,
      containerHeight,
      ...resolveReadAlongAudioData(anim, textboxes, narrationLangCode),
      ...resolveAudioMediaLength(anim, audios),
      ...(cbs ?? {}),
      bypassMotion: resolved.bypassMotion,
    });
    recordAnimStart(i, childrenBefore);
  });

  return tl;
}
