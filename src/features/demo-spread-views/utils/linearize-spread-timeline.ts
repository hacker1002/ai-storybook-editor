// utils/linearize-spread-timeline.ts
// Render-mode linearization: collapse the player's interactive step state-machine
// (on_next / on_click / with_previous / after_previous / auto) into a single linear
// GSAP timeline that a frame clock can seek. Interactive triggers become timed.
//
// SPIKE SCOPE: proves the GSAP-seek hypothesis. PLAY/READ_ALONG carry browser
// side-effects (audio.play, setTimeout, timeline.pause) that are NOT seek-safe —
// here PLAY contributes a pure duration spacer (no side-effect) and audio is
// re-emitted declaratively via Remotion <Audio> at `startSec`.

import type { SpreadAnimation } from "@/types/spread-types";
import { EFFECT_TYPE } from "@/constants/playable-constants";

const DEFAULT_DURATION_SEC = 0.5;
const DEFAULT_PLAY_DURATION_SEC = 3; // spacer when PLAY effect.duration missing

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

function effectDurationSec(anim: SpreadAnimation): number {
  const ms = anim.effect.duration;
  if (typeof ms === "number" && ms > 0) return ms / 1000;
  if (anim.effect.type === EFFECT_TYPE.PLAY) return DEFAULT_PLAY_DURATION_SEC;
  return DEFAULT_DURATION_SEC;
}

/**
 * Mirror of addTweenToTimeline's position semantics: first anim at 0, `with_previous`
 * shares the previous start ("<"), everything else chains sequentially (">").
 * Analytic start/duration approximate GSAP's own resolution closely enough for
 * audio sequencing + scrubber length (GSAP timeline remains the visual source of truth).
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
    } else {
      slotStart = prevStart + prevDur;
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
