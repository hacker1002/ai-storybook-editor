// linearize-spread-timeline.ts
// Render-mode linearization: collapse the player's interactive step state-machine
// (on_next / on_click / with_previous / after_previous / auto) into a single linear
// GSAP timeline that a frame clock can seek. Interactive triggers become timed.
//
// SPIKE → CORE (ADR-035): this is the *analytic* timing model. It produces
// numeric startSec/totalSec used for (a) <Audio> sequencing and (b) the
// composition's durationInFrames — there is NO DOM here. The actual visual
// timeline is built by `buildMasterTimeline`. CONSTRAINT: both must share the
// SAME delay model (TRIGGER_DELAY below) or render audio drifts off its tween.
//
// PLAY/READ_ALONG carry browser side-effects (audio.play, timeline.pause) that
// are NOT seek-safe — here they contribute a pure duration spacer (no
// side-effect) and audio is re-emitted declaratively via Remotion <Audio> at
// `startSec`.

import type { SpreadAnimation } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";

const DEFAULT_DURATION_SEC = 0.5;
const DEFAULT_PLAY_DURATION_SEC = 3; // spacer when PLAY effect.duration missing

/**
 * Pacing delays applied between sequential animations — MUST match the live GSAP
 * engine's `buildAndPlayFullTimeline` (`>+=AFTER_PREVIOUS` / `>+=ON_CLICK_AUTO`)
 * so the analytic startSec here equals each tween's real `startTime()` in
 * `buildMasterTimeline`. Single source of truth: imported by build-master-timeline.ts.
 */
export const TRIGGER_DELAY = {
  /** after_previous chains immediately (no extra gap). */
  AFTER_PREVIOUS: 0,
  /** on_click / on_next become a fixed auto-mode gap (live + render both pace). */
  ON_CLICK_AUTO: 1.0,
} as const;

export interface LinearStep {
  anim: SpreadAnimation;
  /** GSAP position param fed to addTweenToTimeline ("<" = with previous, ">" = sequential). */
  position: number | string;
  /** Analytic start time (s) — used for <Audio> sequencing + composition duration. */
  startSec: number;
  durationSec: number;
  isMedia: boolean;
}

export interface LinearTimeline {
  steps: LinearStep[];
  totalSec: number;
}

/** Duration (s) a single animation occupies on the timeline — shared by the
 *  analytic model and `buildMasterTimeline`'s render-mode media spacers. */
export function effectDurationSec(anim: SpreadAnimation): number {
  const ms = anim.effect.duration;
  if (typeof ms === "number" && ms > 0) return ms / 1000;
  if (anim.effect.type === EFFECT_TYPE.PLAY) return DEFAULT_PLAY_DURATION_SEC;
  return DEFAULT_DURATION_SEC;
}

/**
 * Mirror of buildMasterTimeline's position semantics: first anim at 0,
 * `with_previous` shares the previous start ("<"), `after_previous` chains with
 * no gap, `on_click`/`on_next` chain with the ON_CLICK_AUTO pacing gap. Analytic
 * start/duration approximate GSAP's own resolution closely enough for audio
 * sequencing + scrubber length (the GSAP timeline stays the visual source of truth).
 */
export function linearizeSpreadTimeline(
  animations: SpreadAnimation[]
): LinearTimeline {
  const sorted = [...animations].sort((a, b) => a.order - b.order);
  const steps: LinearStep[] = [];

  let prevStart = 0;
  let prevDur = 0;
  let maxEnd = 0;

  sorted.forEach((anim, i) => {
    const durationSec = effectDurationSec(anim);
    const delaySec = (anim.effect.delay ?? 0) / 1000;
    const isMedia =
      anim.effect.type === EFFECT_TYPE.PLAY ||
      anim.effect.type === EFFECT_TYPE.READ_ALONG;

    let slotStart: number;
    let position: number | string;
    if (i === 0) {
      slotStart = 0;
      position = 0;
    } else if (anim.trigger_type === "with_previous") {
      slotStart = prevStart;
      position = "<";
    } else if (anim.trigger_type === "after_previous") {
      slotStart = prevStart + prevDur + TRIGGER_DELAY.AFTER_PREVIOUS;
      position = ">";
    } else {
      // on_click / on_next → auto-mode pacing gap (mirrors `>+=ON_CLICK_AUTO`)
      slotStart = prevStart + prevDur + TRIGGER_DELAY.ON_CLICK_AUTO;
      position = ">";
    }

    const startSec = slotStart + delaySec;
    steps.push({ anim, position, startSec, durationSec, isMedia });

    prevStart = slotStart;
    prevDur = delaySec + durationSec;
    maxEnd = Math.max(maxEnd, startSec + durationSec);
  });

  return { steps, totalSec: maxEnd };
}
