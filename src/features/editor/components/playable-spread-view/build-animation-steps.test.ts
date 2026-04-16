// build-animation-steps.test.ts - Unit tests for buildAnimationSteps pre-filter logic
// Covers: read-along hidden, on_click hidden (all types), cascade drop, backward compat

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpreadAnimation } from '@/types/spread-types';
import type { SpreadItemsForVisibility } from './player-utils';

// warnMock must be hoisted so the vi.mock factory can reference it
const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: warnMock,
    error: vi.fn(),
  }),
}));

import { buildAnimationSteps } from './player-utils';

function makeAnim(
  order: number,
  trigger: SpreadAnimation['trigger_type'],
  targetId: string,
  targetType: SpreadAnimation['target']['type'] = 'image',
  effectType = 1,
): SpreadAnimation {
  return {
    order,
    type: 0,
    target: { id: targetId, type: targetType },
    trigger_type: trigger,
    effect: { type: effectType },
  };
}

describe('buildAnimationSteps pre-filter (player_visible)', () => {
  beforeEach(() => warnMock.mockClear());

  it('1. no spreadItems → no-op (backward compat)', () => {
    const steps = buildAnimationSteps([makeAnim(1, 'on_next', 'img1')]);
    expect(steps).toHaveLength(1);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('2. all items visible → full steps unchanged', () => {
    const items: SpreadItemsForVisibility = { images: [{ id: 'img1', player_visible: true }] };
    const steps = buildAnimationSteps([makeAnim(1, 'on_next', 'img1')], items);
    expect(steps).toHaveLength(1);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('3. read-along + textbox hidden (on_next boundary) → cascade drop follower', () => {
    const anims = [
      makeAnim(1, 'on_next', 'tb1', 'textbox', 11),      // read-along, boundary trigger
      makeAnim(2, 'with_previous', 'tb2', 'textbox', 11), // chained follower
    ];
    const items: SpreadItemsForVisibility = {
      textboxes: [
        { id: 'tb1', player_visible: false },
        { id: 'tb2', player_visible: true },
      ],
    };
    const steps = buildAnimationSteps(anims, items, 'spread1');
    expect(steps).toHaveLength(0); // both dropped
    expect(warnMock).toHaveBeenCalledTimes(2);
  });

  it('4. read-along + textbox hidden (with_previous non-boundary) → only read-along dropped, follower kept', () => {
    const anims = [
      makeAnim(1, 'on_next', 'tb_ok', 'textbox', 11),     // visible — creates step
      makeAnim(2, 'with_previous', 'tb1', 'textbox', 11),  // hidden, non-boundary → no cascade
      makeAnim(3, 'after_previous', 'tb2', 'textbox', 11), // follower — should survive
    ];
    const items: SpreadItemsForVisibility = {
      textboxes: [
        { id: 'tb_ok', player_visible: true },
        { id: 'tb1', player_visible: false },
        { id: 'tb2', player_visible: true },
      ],
    };
    const steps = buildAnimationSteps(anims, items, 'spread1');
    // 1 step: anim 1 (on_next visible) + anim 3 (after_previous, not cascade-dropped)
    expect(steps).toHaveLength(1);
    expect(steps[0].animations).toHaveLength(2);
    expect(warnMock).toHaveBeenCalledTimes(1); // only hidden read-along
  });

  it('5. on_click + visual hidden → cascade drop chained follower', () => {
    const anims = [
      makeAnim(1, 'on_click', 'img1', 'image', 1),      // on_click, hidden target
      makeAnim(2, 'with_previous', 'img2', 'image', 1),  // chained follower → dropped by cascade
    ];
    const items: SpreadItemsForVisibility = {
      images: [
        { id: 'img1', player_visible: false },
        { id: 'img2', player_visible: true },
      ],
    };
    const steps = buildAnimationSteps(anims, items, 'spread1');
    expect(steps).toHaveLength(0);
    expect(warnMock).toHaveBeenCalledTimes(2);
  });

  it('6. on_click + audio hidden → dropped (Session 1 critical fix: hiddenAllIds)', () => {
    const anims = [makeAnim(1, 'on_click', 'aud1', 'audio', 1)];
    const items: SpreadItemsForVisibility = {
      audios: [{ id: 'aud1', player_visible: false }],
    };
    const steps = buildAnimationSteps(anims, items, 'spread1');
    expect(steps).toHaveLength(0);
    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  it('7. on_click + quiz hidden → dropped (Session 1 critical fix: hiddenAllIds)', () => {
    const anims = [makeAnim(1, 'on_click', 'quiz1', 'quiz', 1)];
    const items: SpreadItemsForVisibility = {
      quizzes: [{ id: 'quiz1', player_visible: false }],
    };
    const steps = buildAnimationSteps(anims, items, 'spread1');
    expect(steps).toHaveLength(0);
    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  it('8. warn log includes spreadId, order, targetId, reason', () => {
    const anims = [makeAnim(5, 'on_click', 'img1', 'image', 1)];
    const items: SpreadItemsForVisibility = {
      images: [{ id: 'img1', player_visible: false }],
    };
    buildAnimationSteps(anims, items, 'spread-abc');
    expect(warnMock).toHaveBeenCalledWith(
      'preFilterHiddenTargets',
      'on_click skipped — target hidden',
      expect.objectContaining({
        spreadId: 'spread-abc',
        order: 5,
        targetId: 'img1',
        reason: expect.any(String),
      }),
    );
  });
});
