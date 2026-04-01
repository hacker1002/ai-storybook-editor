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

// === Dynamic edition filter ===

/**
 * Generic on_click chain filter. Removes on_click items and their chained
 * with_previous/after_previous followers. Works with any item type via accessors.
 */
function filterOutClickChains<T>(
  items: T[],
  getOrder: (item: T) => number,
  getTrigger: (item: T) => string,
): T[] {
  if (!items || items.length === 0) return [];

  const sorted = [...items].sort((a, b) => getOrder(a) - getOrder(b));
  const result: T[] = [];
  let inClickGroup = false;

  for (const item of sorted) {
    const trigger = getTrigger(item);

    if (trigger === 'on_click') {
      inClickGroup = true;
      continue;
    }

    if (trigger === 'on_next') {
      inClickGroup = false;
      result.push(item);
      continue;
    }

    // with_previous or after_previous
    if (!inClickGroup) {
      result.push(item);
    }
  }

  return result;
}

/**
 * Filters out on_click animations AND their chained followers for the Dynamic edition.
 */
export function filterAnimationsForDynamic(animations: SpreadAnimation[]): SpreadAnimation[] {
  return filterOutClickChains(animations, (a) => a.order, (a) => a.trigger_type);
}

/**
 * Filters out on_click resolved animations AND their chained followers for the Dynamic edition.
 * Used by player-animation-sidebar which wraps animations in ResolvedAnimation.
 */
export function filterResolvedAnimationsForDynamic<T extends { animation: { order: number; trigger_type: string } }>(
  items: T[],
): T[] {
  return filterOutClickChains(items, (i) => i.animation.order, (i) => i.animation.trigger_type);
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
