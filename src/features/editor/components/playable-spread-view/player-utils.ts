// player-utils.ts - Utility functions for building and navigating animation steps

import type { SpreadAnimation, Geometry } from '@/types/spread-types';
import type { AnimationStep } from '@/types/playable-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Player', 'GsapEngine');

/**
 * ⚡ ADR-023: True when the item's bounding box overlaps the staging area.
 * Staging = [-50, 150] on each axis (relative to full bleed canvas [0, 100]).
 * Items fully outside staging are culled from player render and their on_click steps skipped.
 */
export function isInStaging(geo: Geometry): boolean {
  return geo.x + geo.w > -50 && geo.x < 150 && geo.y + geo.h > -50 && geo.y < 150;
}

/** Spread item arrays needed for player_visible pre-filter in buildAnimationSteps */
export interface SpreadItemsForVisibility {
  images?: Array<{ id: string; player_visible?: boolean; geometry?: Geometry }>;
  shapes?: Array<{ id: string; player_visible?: boolean; geometry?: Geometry }>;
  videos?: Array<{ id: string; player_visible?: boolean; geometry?: Geometry }>;
  auto_pics?: Array<{ id: string; player_visible?: boolean; geometry?: Geometry }>;
  textboxes?: Array<{ id: string; player_visible?: boolean; geometry?: Geometry }>;
  audios?: Array<{ id: string; player_visible?: boolean; geometry?: Geometry }>;
  quizzes?: Array<{ id: string; player_visible?: boolean; geometry?: Geometry }>;
}

// === Building steps from raw animations ===

/**
 * Pre-filter animations for player_visible split-by-type rule.
 * Must be called on already-sorted animations.
 *
 * - hiddenVisualIds (5 types): read-along check
 * - hiddenAllIds (7 types): on_click check
 * - Cascade drop: followers (with_previous/after_previous) of a dropped boundary are also dropped
 */
function preFilterHiddenTargets(
  sorted: SpreadAnimation[],
  items: SpreadItemsForVisibility,
  spreadId?: string,
): SpreadAnimation[] {
  // Build id sets — O(n) once before the loop
  const hiddenVisualIds = new Set<string>();
  const hiddenAllIds = new Set<string>();
  // on_click targets geometrically outside staging are also skipped
  const outOfStagingIds = new Set<string>();

  const markHidden = (arr: Array<{ id: string; player_visible?: boolean; geometry?: Geometry }> | undefined, visual: boolean) => {
    arr?.forEach((item) => {
      if (item.player_visible === false) {
        hiddenAllIds.add(item.id);
        if (visual) hiddenVisualIds.add(item.id);
      }
      if (item.geometry && !isInStaging(item.geometry)) {
        outOfStagingIds.add(item.id);
      }
    });
  };

  markHidden(items.images, true);
  markHidden(items.shapes, true);
  markHidden(items.videos, true);
  markHidden(items.auto_pics, true);
  markHidden(items.textboxes, true);
  markHidden(items.audios, false);
  markHidden(items.quizzes, false);

  if (hiddenAllIds.size === 0 && outOfStagingIds.size === 0) return sorted; // fast path

  const result: SpreadAnimation[] = [];
  let skipNextChained = false;

  for (const anim of sorted) {
    const trigger = anim.trigger_type;
    const targetId = anim.target.id;

    // Case 1: cascade drop — follower of a dropped boundary
    if (skipNextChained && (trigger === 'with_previous' || trigger === 'after_previous')) {
      log.warn('preFilterHiddenTargets', 'chained follower dropped (cascade)', { spreadId, order: anim.order, targetId, reason: 'cascade' });
      continue;
    }

    // Reset cascade when a new boundary is encountered
    if (trigger === 'on_next' || trigger === 'on_click') {
      skipNextChained = false;
    }

    // Case 2: read-along (type=11) targeting hidden textbox (visual only)
    if (anim.effect.type === 11 && hiddenVisualIds.has(targetId)) {
      log.warn('preFilterHiddenTargets', 'read-along skipped — textbox hidden', { spreadId, order: anim.order, targetId, reason: 'read-along-hidden' });
      skipNextChained = trigger === 'on_next' || trigger === 'on_click';
      continue;
    }

    // Case 3: on_click targeting ANY hidden item (all 7 types)
    if (trigger === 'on_click' && hiddenAllIds.has(targetId)) {
      log.warn('preFilterHiddenTargets', 'on_click skipped — target hidden', { spreadId, order: anim.order, targetId, targetType: anim.target.type, reason: 'on-click-hidden' });
      skipNextChained = true; // on_click is always a boundary
      continue;
    }

    // Case 4: on_click targeting item geometrically outside staging (culled from player render)
    if (trigger === 'on_click' && outOfStagingIds.has(targetId)) {
      log.warn('preFilterHiddenTargets', 'on_click skipped — target outside staging', { spreadId, order: anim.order, targetId, targetType: anim.target.type, reason: 'on-click-out-of-staging' });
      skipNextChained = true;
      continue;
    }

    result.push(anim);
  }

  return result;
}

/**
 * Groups sorted animations into discrete playback steps.
 *
 * Rules:
 * - on_next / on_click triggers create a new step
 * - after_previous / with_previous append to the current step
 * - If the spread starts with after_previous/with_previous (no preceding trigger),
 *   an 'auto' step is created that plays automatically on spread load
 *
 * Pre-filter (when spreadItems provided):
 * - read-along (effect type=11) targeting hidden textbox → skip + cascade drop chained followers if boundary
 * - on_click targeting ANY hidden item (all 7 types) → skip + cascade drop chained followers
 */
export function buildAnimationSteps(
  animations: SpreadAnimation[],
  spreadItems?: SpreadItemsForVisibility,
  spreadId?: string,
): AnimationStep[] {
  if (!animations || animations.length === 0) return [];

  // Sort by order ascending (don't mutate original)
  const baseSorted = [...animations].sort((a, b) => a.order - b.order);

  // Pre-filter hidden targets before building steps
  const sorted = spreadItems ? preFilterHiddenTargets(baseSorted, spreadItems, spreadId) : baseSorted;

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
