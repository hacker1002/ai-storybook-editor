// player-utils.ts - Utility functions for building and navigating animation steps

import type { SpreadAnimation } from '@/types/spread-types';
import type { AnimationStep } from '@/types/playable-types';

// === Building steps from raw animations ===

/**
 * Groups sorted animations into discrete playback steps.
 *
 * Rules:
 * - on_next / on_click triggers create a new step
 * - after_previous / with_previous append to the current step
 * - If the spread starts with after_previous/with_previous (no preceding trigger),
 *   an 'auto' step is created that plays automatically on spread load
 */
export function buildAnimationSteps(animations: SpreadAnimation[]): AnimationStep[] {
  if (!animations || animations.length === 0) return [];

  // Sort by order ascending (don't mutate original)
  const sorted = [...animations].sort((a, b) => a.order - b.order);

  const steps: AnimationStep[] = [];
  let currentStep: AnimationStep | null = null;

  for (const anim of sorted) {
    const trigger = anim.trigger_type;

    if (trigger === 'on_next' || trigger === 'on_click') {
      // New step for each on_next / on_click trigger
      currentStep = {
        index: steps.length,
        triggerType: trigger === 'on_next' ? 'on_next' : 'on_click',
        mustComplete: false,
        animations: [anim],
      };

      if (trigger === 'on_click') {
        currentStep.targetId = anim.target.id;
        currentStep.clickLoop = anim.click_loop ?? 0;
      }

      steps.push(currentStep);
    } else {
      // after_previous or with_previous
      if (currentStep) {
        // Append to existing step
        currentStep.animations.push(anim);
      } else {
        // No preceding step — create an 'auto' step (spread starts with these)
        currentStep = {
          index: steps.length,
          triggerType: 'auto',
          mustComplete: false,
          animations: [anim],
        };
        steps.push(currentStep);
      }
    }
  }

  // Compute mustComplete from animation data
  for (const step of steps) {
    step.mustComplete = step.animations.some(a => !!a.must_complete);
  }

  return steps;
}

// === Navigating steps by trigger type ===

/** Find the next step with triggerType='on_next' starting from `fromIndex` */
export function findNextOnNextStep(
  steps: AnimationStep[],
  fromIndex: number
): number {
  for (let i = fromIndex; i < steps.length; i++) {
    if (steps[i].triggerType === 'on_next') return i;
  }
  return -1;
}

/** Find the previous step with triggerType='on_next' searching backward from `fromIndex - 1` */
export function findPrevOnNextStep(
  steps: AnimationStep[],
  fromIndex: number
): number {
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (steps[i].triggerType === 'on_next') return i;
  }
  return -1;
}

/** Find on_click step matching targetId within consecutive on_click chain after afterIndex */
export function findOnClickStepForTarget(
  steps: AnimationStep[],
  afterIndex: number,
  targetId: string
): number {
  for (let i = afterIndex + 1; i < steps.length; i++) {
    if (steps[i].triggerType !== 'on_click') break; // stop at non-on_click
    if (steps[i].targetId === targetId) return i;
  }
  return -1;
}

/** Check if an item has remaining click loop replays */
export function isReplayableClick(
  replayableItems: Map<string, { remainingReplays: number }>,
  itemId: string
): boolean {
  const entry = replayableItems.get(itemId);
  return !!entry && entry.remainingReplays > 0;
}
