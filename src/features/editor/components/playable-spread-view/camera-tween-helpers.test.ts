// camera-tween-helpers.test.ts — Unit tests for Camera animation runtime helpers.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import gsap from 'gsap';
import type { SpreadAnimation } from '@/types/spread-types';
import {
  getVisualSiblings,
  addCameraTweenToTimeline,
  applyCameraEndState,
} from './camera-tween-helpers';

function makeAnim(
  effectType: 18 | 19,
  overrides: Partial<SpreadAnimation['effect']> = {},
  targetId = 'item-target',
  targetType: SpreadAnimation['target']['type'] = 'image',
): SpreadAnimation {
  return {
    order: 0,
    type: 0,
    target: { id: targetId, type: targetType },
    trigger_type: 'on_next',
    effect: {
      type: effectType,
      delay: 0,
      duration: 3000,
      payload: { ease_time: 500 },
      ...(effectType === 19 ? { geometry: { x: 25, y: 25, w: 50, h: 50 } } : {}),
      ...overrides,
    },
  };
}

function setupContainer(itemIds: string[], dims: { w: number; h: number } = { w: 1000, h: 500 }) {
  const container = document.createElement('div');
  Object.defineProperty(container, 'offsetWidth', { configurable: true, value: dims.w });
  Object.defineProperty(container, 'offsetHeight', { configurable: true, value: dims.h });
  document.body.appendChild(container);
  for (const id of itemIds) {
    // Mirror real DOM: wrapper [data-item-id] + inner absolute visual child.
    // Focus tween targets the inner child to avoid containing-block collapse
    // (filter on wrapper would zero out child's percentage top/height).
    const wrapper = document.createElement('div');
    wrapper.dataset.itemId = id;
    const visual = document.createElement('div');
    visual.dataset.visualFor = id;
    wrapper.appendChild(visual);
    container.appendChild(wrapper);
  }
  return container;
}

describe('getVisualSiblings', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = setupContainer(['item-1', 'item-2', 'item-3', 'item-4', 'item-5']);
  });

  afterEach(() => {
    container.remove();
  });

  it('returns siblings excluding target (string form)', () => {
    const siblings = getVisualSiblings(container, 'item-3');
    expect(siblings).toHaveLength(4);
    expect(siblings.map((el) => el.dataset.itemId)).not.toContain('item-3');
  });

  it('returns empty array when spreadEl is null', () => {
    expect(getVisualSiblings(null, 'item-1')).toEqual([]);
  });

  it('returns all when target not present', () => {
    const siblings = getVisualSiblings(container, 'nonexistent');
    expect(siblings).toHaveLength(5);
  });

  it('accepts a Set of exclude IDs and removes all matches', () => {
    const siblings = getVisualSiblings(container, new Set(['item-1', 'item-3', 'item-5']));
    expect(siblings.map((el) => el.dataset.itemId).sort()).toEqual(['item-2', 'item-4']);
  });
});

describe('addCameraTweenToTimeline — Focus (18)', () => {
  let tl: gsap.core.Timeline;
  let container: HTMLDivElement;

  beforeEach(() => {
    tl = gsap.timeline({ paused: true });
    container = setupContainer(['item-1', 'item-2', 'item-3']);
  });

  afterEach(() => {
    tl.kill();
    container.remove();
  });

  it('inserts 2 tweens (ease-in + revert) on a populated container', () => {
    const anim = makeAnim(18, {}, 'item-2');
    const before = tl.getChildren().length;
    addCameraTweenToTimeline(tl, anim, container, 0);
    const after = tl.getChildren().length;
    expect(after - before).toBe(2);
  });

  it('Phase 1 ease-in props match (filter blur only, ease time)', () => {
    const anim = makeAnim(18, {}, 'item-2');
    addCameraTweenToTimeline(tl, anim, container, 0);
    const phase1 = tl.getChildren()[0];
    expect(phase1.vars.filter).toBe('blur(3px)'); // CAMERA_DEFAULTS.FOCUS_BLUR_PX = 3
    expect(phase1.vars.opacity).toBeUndefined();
    expect(phase1.duration()).toBeCloseTo(0.5, 2);
  });

  it('skips when no siblings present', () => {
    const empty = setupContainer(['item-x']);
    const anim = makeAnim(18, {}, 'item-x');
    const before = tl.getChildren().length;
    addCameraTweenToTimeline(tl, anim, empty, 0);
    expect(tl.getChildren().length).toBe(before);
    empty.remove();
  });

  it('uses resolvedTargetId override when provided (composite Focus)', () => {
    const anim = makeAnim(18, {}, 'composite-id', 'composite');
    addCameraTweenToTimeline(tl, anim, container, 0, 'item-2');
    const phase1 = tl.getChildren()[0];
    // Phase 1 tween should target 3 - 1 = 2 siblings (item-2 excluded as resolved target)
    // Targets are the inner visual children; their parent carries the data-item-id.
    const targets = phase1.targets() as HTMLElement[];
    expect(targets).toHaveLength(2);
    expect(targets.map((el) => el.dataset.visualFor).sort()).toEqual(['item-1', 'item-3']);
    targets.forEach((el) => {
      expect(el.parentElement?.dataset.itemId).toBeDefined();
    });
  });

  it('excludeIds option removes additional concurrent targets from blur set', () => {
    const anim = makeAnim(18, {}, 'item-2');
    addCameraTweenToTimeline(tl, anim, container, 0, undefined, { excludeIds: ['item-3'] });
    const phase1 = tl.getChildren()[0];
    const targets = phase1.targets() as HTMLElement[];
    // Only item-1 should be blurred (item-2 = self, item-3 = concurrent exclude)
    expect(targets).toHaveLength(1);
    expect(targets[0].dataset.visualFor).toBe('item-1');
  });

  it('onStart/onComplete wire via tween vars and add NO extra timeline children (preserves "<" reference for with_previous anims added after)', () => {
    const anim = makeAnim(18, {}, 'item-2');
    const onStart = vi.fn();
    const onComplete = vi.fn();
    const before = tl.getChildren().length;
    addCameraTweenToTimeline(tl, anim, container, 0, undefined, { onStart, onComplete });
    // Critical invariant: only 2 timeline children (ease-in tween + revert set).
    // Wrapping with `tl.call(...)` would shift GSAP's "<" reference and break
    // simultaneous (with_previous) animations queued after the camera tween.
    expect(tl.getChildren().length - before).toBe(2);
    const [phase1, phase3] = tl.getChildren();
    expect(phase1.vars.onStart).toBe(onStart);
    expect(phase3.vars.onComplete).toBe(onComplete);
  });

  it('targets inner visual children (not [data-item-id] wrappers) to avoid containing-block collapse', () => {
    const anim = makeAnim(18, {}, 'item-2');
    addCameraTweenToTimeline(tl, anim, container, 0);
    const phase1 = tl.getChildren()[0];
    const targets = phase1.targets() as HTMLElement[];
    targets.forEach((el) => {
      expect(el.dataset.itemId).toBeUndefined();
      expect(el.dataset.visualFor).toBeDefined();
    });
  });
});

describe('addCameraTweenToTimeline — Zoom (19)', () => {
  let tl: gsap.core.Timeline;
  let container: HTMLDivElement;

  beforeEach(() => {
    tl = gsap.timeline({ paused: true });
    container = setupContainer([], { w: 1000, h: 500 });
  });

  afterEach(() => {
    tl.kill();
    container.remove();
  });

  it('computes scale + translate that centers zoom area into container', () => {
    // Container 1000x500, zg = {25, 25, 50, 50} → zoom center is at (500, 250) elem px,
    // scale=2. For container center (500, 250) to receive elem center, we need:
    //   tx = 500 − 2·500 = −500
    //   ty = 250 − 2·250 = −250
    // The earlier (incorrect) formula `(spreadW/2 − zoomCenterX)·scale` returned 0,0
    // which actually shifted the zoom to the top-left.
    const anim = makeAnim(19, { geometry: { x: 25, y: 25, w: 50, h: 50 } });
    addCameraTweenToTimeline(tl, anim, container, 0);
    const phase1 = tl.getChildren()[0];
    expect(phase1.vars.scale).toBe(2); // 100/50
    expect(phase1.vars.x).toBeCloseTo(-500, 5);
    expect(phase1.vars.y).toBeCloseTo(-250, 5);
  });

  it('top-left zoom (zg.x=0, zg.y=0) yields zero translate', () => {
    // Special case: zooming into top-left quadrant requires no shift since
    // transform-origin is (0,0).
    const anim = makeAnim(19, { geometry: { x: 0, y: 0, w: 50, h: 50 } });
    addCameraTweenToTimeline(tl, anim, container, 0);
    const phase1 = tl.getChildren()[0];
    expect(phase1.vars.x).toBeCloseTo(0, 5);
    expect(phase1.vars.y).toBeCloseTo(0, 5);
  });

  it('Phase 3 set reverts scale + translate to 1, 0, 0', () => {
    const anim = makeAnim(19);
    addCameraTweenToTimeline(tl, anim, container, 0);
    const [, phase3] = tl.getChildren();
    expect(phase3.vars.scale).toBe(1);
    expect(phase3.vars.x).toBe(0);
    expect(phase3.vars.y).toBe(0);
  });

  it('skips when geometry missing', () => {
    const anim = makeAnim(19, { geometry: undefined });
    const before = tl.getChildren().length;
    addCameraTweenToTimeline(tl, anim, container, 0);
    expect(tl.getChildren().length).toBe(before);
  });

  it('skips when spreadEl null', () => {
    const anim = makeAnim(19);
    const before = tl.getChildren().length;
    addCameraTweenToTimeline(tl, anim, null, 0);
    expect(tl.getChildren().length).toBe(before);
  });

  // Regression: headless Remotion render measures offsetWidth/Height as 0 (build
  // layout-effect before layout resolves) → without a fallback the zoom is silently
  // skipped and the rendered MP4 shows no zoom (works in the live player, >0).
  it('zero offset + fallback dims → builds the zoom using fallback (not skipped)', () => {
    const zeroContainer = setupContainer([], { w: 0, h: 0 });
    const anim = makeAnim(19, { geometry: { x: 25, y: 25, w: 50, h: 50 } });
    addCameraTweenToTimeline(tl, anim, zeroContainer, 0, undefined, {
      containerWidth: 1000,
      containerHeight: 500,
    });
    const phase1 = tl.getChildren()[0];
    expect(phase1).toBeDefined();
    expect(phase1.vars.scale).toBe(2); // 100/50
    expect(phase1.vars.x).toBeCloseTo(-500, 5); // uses fallback 1000, not measured 0
    expect(phase1.vars.y).toBeCloseTo(-250, 5);
    zeroContainer.remove();
  });

  it('zero offset + no fallback → still skips (defensive guard intact)', () => {
    const zeroContainer = setupContainer([], { w: 0, h: 0 });
    const anim = makeAnim(19);
    const before = tl.getChildren().length;
    addCameraTweenToTimeline(tl, anim, zeroContainer, 0);
    expect(tl.getChildren().length).toBe(before);
    zeroContainer.remove();
  });
});

describe('applyCameraEndState', () => {
  it('Focus: resets sibling filter via gsap.set', () => {
    const container = setupContainer(['item-1', 'item-2', 'item-3']);
    const setSpy = vi.spyOn(gsap, 'set');
    const anim = makeAnim(18, {}, 'item-2');
    applyCameraEndState(anim, container);
    expect(setSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ filter: 'none' }),
    );
    setSpy.mockRestore();
    container.remove();
  });

  it('Zoom: resets spread scale/x/y via gsap.set', () => {
    const container = setupContainer([], { w: 800, h: 600 });
    const setSpy = vi.spyOn(gsap, 'set');
    const anim = makeAnim(19);
    applyCameraEndState(anim, container);
    expect(setSpy).toHaveBeenCalledWith(
      container,
      expect.objectContaining({ scale: 1, x: 0, y: 0 }),
    );
    setSpy.mockRestore();
    container.remove();
  });

  it('no-op when spreadEl null', () => {
    const setSpy = vi.spyOn(gsap, 'set');
    const anim = makeAnim(18);
    applyCameraEndState(anim, null);
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });
});
