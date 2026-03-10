// animation-step-grouping.ts - Groups SpreadAnimation[] into AnimationStep[] for playback

import type { SpreadAnimation } from '../shared';
import type { AnimationStep } from './types';

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
          animations: [anim],
        };
        steps.push(currentStep);
      }
    }
  }

  return steps;
}
