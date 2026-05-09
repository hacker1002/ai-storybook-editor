// animation-tween-builders.test.ts — Unit tests for GSAP tween builders (Lines/Arcs focus).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import gsap from 'gsap';
import type { SpreadAnimation } from '@/types/spread-types';
import { addTweenToTimeline } from './animation-tween-builders';

// Mock logger
const { debugMock } = vi.hoisted(() => ({ debugMock: vi.fn() }));
vi.mock('@/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: debugMock,
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function makeAnim(
  effectType: number,
  overrides: Partial<SpreadAnimation['effect']> = {},
  targetId = 'item-target',
): SpreadAnimation {
  return {
    order: 0,
    type: 0,
    target: { id: targetId, type: 'image' },
    trigger_type: 'on_next',
    effect: {
      type: effectType,
      delay: 0,
      duration: 1000,
      ...overrides,
    },
  };
}

describe('addTweenToTimeline — Lines (16)', () => {
  let tl: gsap.core.Timeline;
  let element: HTMLDivElement;

  beforeEach(() => {
    tl = gsap.timeline({ paused: true });
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  afterEach(() => {
    tl.kill();
    element.remove();
    debugMock.mockClear();
  });

  it('adds linear motion tween with correct deltaX and deltaY', () => {
    const anim = makeAnim(16, {
      geometry: { x: 30, y: 30, w: 20, h: 20 },
    });
    const containerWidth = 1000;
    const containerHeight = 500;
    const itemGeometry = { x: 10, y: 10, w: 20, h: 20 };

    const tlLengthBefore = tl.getChildren().length;
    addTweenToTimeline(tl, anim, element, 0, {
      containerWidth,
      containerHeight,
      itemGeometry,
    });
    const tlLengthAfter = tl.getChildren().length;

    // Should add exactly one tween (to)
    expect(tlLengthAfter - tlLengthBefore).toBe(1);

    // Check the tween's target values
    // deltaX = (30 - 10) / 100 * 1000 = 0.2 * 1000 = 200
    // deltaY = (30 - 10) / 100 * 500 = 0.2 * 500 = 100
    const tween = tl.getChildren()[tlLengthBefore] as any;
    expect(tween.targets()[0]).toBe(element);
    expect(tween.vars.x).toBeCloseTo(200, 5);
    expect(tween.vars.y).toBeCloseTo(100, 5);
    expect(tween.vars.ease).toBe('power1.inOut');
  });

  it('skips tween when deltaX and deltaY both < 1px (degenerate)', () => {
    const anim = makeAnim(16, {
      geometry: { x: 10, y: 10, w: 20, h: 20 },
    });
    const containerWidth = 1000;
    const containerHeight = 500;
    const itemGeometry = { x: 10, y: 10, w: 20, h: 20 };

    const tlLengthBefore = tl.getChildren().length;
    addTweenToTimeline(tl, anim, element, 0, {
      containerWidth,
      containerHeight,
      itemGeometry,
    });
    const tlLengthAfter = tl.getChildren().length;

    // Degenerate: no tween added
    expect(tlLengthAfter - tlLengthBefore).toBe(0);
    expect(debugMock).toHaveBeenCalledWith(
      'addLinesTween',
      'degenerate delta — skip tween',
      expect.objectContaining({
        targetId: 'item-target',
      }),
    );
  });

  it('calculates deltaX and deltaY correctly with different item origins', () => {
    const anim = makeAnim(16, {
      geometry: { x: 50, y: 60, w: 30, h: 40 },
    });
    const containerWidth = 800;
    const containerHeight = 600;
    const itemGeometry = { x: 20, y: 10, w: 30, h: 40 };

    addTweenToTimeline(tl, anim, element, 0, {
      containerWidth,
      containerHeight,
      itemGeometry,
    });

    // deltaX = (50 - 20) / 100 * 800 = 0.3 * 800 = 240
    // deltaY = (60 - 10) / 100 * 600 = 0.5 * 600 = 300
    const tween = tl.getChildren()[0] as any;
    expect(tween.vars.x).toBeCloseTo(240, 5);
    expect(tween.vars.y).toBeCloseTo(300, 5);
  });

  it('respects duration from effect', () => {
    const anim = makeAnim(16, {
      duration: 2000, // 2 seconds
      geometry: { x: 30, y: 30, w: 20, h: 20 },
    });
    const itemGeometry = { x: 10, y: 10, w: 20, h: 20 };

    addTweenToTimeline(tl, anim, element, 0, {
      containerWidth: 1000,
      containerHeight: 500,
      itemGeometry,
    });

    const tween = tl.getChildren()[0] as any;
    expect(tween.vars.duration).toBeCloseTo(2, 5);
  });

  it('respects delay from effect', () => {
    const anim = makeAnim(16, {
      delay: 500, // 500ms delay
      geometry: { x: 30, y: 30, w: 20, h: 20 },
    });
    const itemGeometry = { x: 10, y: 10, w: 20, h: 20 };

    addTweenToTimeline(tl, anim, element, 0, {
      containerWidth: 1000,
      containerHeight: 500,
      itemGeometry,
    });

    const tween = tl.getChildren()[0] as any;
    expect(tween.vars.delay).toBeCloseTo(0.5, 5);
  });
});

describe('addTweenToTimeline — Arcs (17) legacy fallback', () => {
  let tl: gsap.core.Timeline;
  let element: HTMLDivElement;

  beforeEach(() => {
    tl = gsap.timeline({ paused: true });
    element = document.createElement('div');
    document.body.appendChild(element);
    debugMock.mockClear();
  });

  afterEach(() => {
    tl.kill();
    element.remove();
    debugMock.mockClear();
  });

  it('adds identical tween as Lines (16) for same geometry/item', () => {
    const geometry = { x: 30, y: 30, w: 20, h: 20 };
    const itemGeometry = { x: 10, y: 10, w: 20, h: 20 };
    const containerWidth = 1000;
    const containerHeight = 500;
    const options = { containerWidth, containerHeight, itemGeometry };

    // Add Lines (16)
    const anim16 = makeAnim(16, { geometry });
    const element16 = document.createElement('div');
    document.body.appendChild(element16);
    const tl16 = gsap.timeline({ paused: true });
    addTweenToTimeline(tl16, anim16, element16, 0, options);
    const tween16 = tl16.getChildren()[0] as any;

    // Add Arcs (17)
    const anim17 = makeAnim(17, { geometry });
    const element17 = document.createElement('div');
    document.body.appendChild(element17);
    const tl17 = gsap.timeline({ paused: true });
    addTweenToTimeline(tl17, anim17, element17, 0, options);
    const tween17 = tl17.getChildren()[0] as any;

    // Both should have identical motion parameters
    expect(tween16.vars.x).toBeCloseTo(tween17.vars.x, 5);
    expect(tween16.vars.y).toBeCloseTo(tween17.vars.y, 5);
    expect(tween16.vars.duration).toBeCloseTo(tween17.vars.duration, 5);
    expect(tween16.vars.ease).toBe(tween17.vars.ease);

    tl16.kill();
    tl17.kill();
    element16.remove();
    element17.remove();
  });

  it('logs debug message "arcs legacy fallback to lines"', () => {
    const anim = makeAnim(17, {
      geometry: { x: 30, y: 30, w: 20, h: 20 },
    });
    const itemGeometry = { x: 10, y: 10, w: 20, h: 20 };

    addTweenToTimeline(tl, anim, element, 0, {
      containerWidth: 1000,
      containerHeight: 500,
      itemGeometry,
    });

    expect(debugMock).toHaveBeenCalledWith(
      'addTweenToTimeline',
      'arcs legacy fallback to lines',
      expect.objectContaining({
        targetId: 'item-target',
      }),
    );
  });

  it('handles degenerate case for Arcs (17)', () => {
    const anim = makeAnim(17, {
      geometry: { x: 10, y: 10, w: 20, h: 20 },
    });
    const itemGeometry = { x: 10, y: 10, w: 20, h: 20 };

    const tlLengthBefore = tl.getChildren().length;
    addTweenToTimeline(tl, anim, element, 0, {
      containerWidth: 1000,
      containerHeight: 500,
      itemGeometry,
    });
    const tlLengthAfter = tl.getChildren().length;

    // Degenerate: no tween added
    expect(tlLengthAfter - tlLengthBefore).toBe(0);
  });
});

describe('addTweenToTimeline — container dimension fallback', () => {
  let tl: gsap.core.Timeline;
  let element: HTMLDivElement;

  beforeEach(() => {
    tl = gsap.timeline({ paused: true });
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  afterEach(() => {
    tl.kill();
    element.remove();
  });

  it('uses default container dimensions when not provided', () => {
    const anim = makeAnim(16, {
      geometry: { x: 30, y: 30, w: 20, h: 20 },
    });
    const itemGeometry = { x: 10, y: 10, w: 20, h: 20 };

    // No containerWidth/Height provided
    addTweenToTimeline(tl, anim, element, 0, {
      itemGeometry,
      canvasWidth: 800,
      canvasHeight: 600,
    });

    // Should use canvasWidth/canvasHeight (fallback)
    const tween = tl.getChildren()[0] as any;
    // deltaX = (30 - 10) / 100 * 800 = 160
    // deltaY = (30 - 10) / 100 * 600 = 120
    expect(tween.vars.x).toBeCloseTo(160, 5);
    expect(tween.vars.y).toBeCloseTo(120, 5);
  });

  it('uses hardcoded fallback (800x600) when all dimensions missing', () => {
    const anim = makeAnim(16, {
      geometry: { x: 30, y: 30, w: 20, h: 20 },
    });
    const itemGeometry = { x: 10, y: 10, w: 20, h: 20 };

    // No dimensions provided
    addTweenToTimeline(tl, anim, element, 0, {
      itemGeometry,
    });

    const tween = tl.getChildren()[0] as any;
    // deltaX = (30 - 10) / 100 * 800 = 160
    // deltaY = (30 - 10) / 100 * 600 = 120
    expect(tween.vars.x).toBeCloseTo(160, 5);
    expect(tween.vars.y).toBeCloseTo(120, 5);
  });
});

describe('addTweenToTimeline — missing geometry guard', () => {
  let tl: gsap.core.Timeline;
  let element: HTMLDivElement;

  beforeEach(() => {
    tl = gsap.timeline({ paused: true });
    element = document.createElement('div');
    document.body.appendChild(element);
  });

  afterEach(() => {
    tl.kill();
    element.remove();
  });

  it('skips tween when Lines effect missing geometry', () => {
    const anim = makeAnim(16, {
      // No geometry field
    });

    const tlLengthBefore = tl.getChildren().length;
    addTweenToTimeline(tl, anim, element, 0, {
      containerWidth: 1000,
      containerHeight: 500,
    });
    const tlLengthAfter = tl.getChildren().length;

    // Should skip (no geometry)
    expect(tlLengthAfter - tlLengthBefore).toBe(0);
  });
});
