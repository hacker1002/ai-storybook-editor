// player-initial-states.test.ts - Unit tests for applyInitialStates composite-aware target resolution.
//
// H-1 fix: applyInitialStates must resolve composite-targeted animations to the active
// variant id (under playEdition) before keying into elementRefsMap. Previously it keyed by
// raw target.id (the composite id), which silently no-op'd because no element is registered
// under the composite id. Result: composite × dynamic FLY_IN/FLOAT_IN/ZOOM "popped in" instead
// of starting from the offscreen anchor.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import gsap from 'gsap';
import type { SpreadAnimation, SpreadComposite } from '@/types/spread-types';
import { applyInitialStates, resolveInitialState } from './player-initial-states';
import { EFFECT_TYPE } from '@/constants/playable-constants';

// Track gsap.set calls so we can assert which element was targeted.
const gsapSetSpy = vi.spyOn(gsap, 'set');

function makeAnim(
  order: number,
  targetId: string,
  targetType: 'image' | 'composite' | 'textbox' = 'image',
  effectType: number = EFFECT_TYPE.FLY_IN,
): SpreadAnimation {
  return {
    order,
    type: 0,
    target: { id: targetId, type: targetType },
    trigger_type: 'on_next',
    effect: { type: effectType, direction: 'left' },
  };
}

function makeComposite(
  id: string,
  variants: Array<{ id: string; type: 'image' | 'auto_pic'; edition: 'classic' | 'dynamic' | 'interactive' }>,
): SpreadComposite {
  return { id, title: id, 'z-index': 50, variants };
}

describe('applyInitialStates — composite target resolution (H-1)', () => {
  beforeEach(() => {
    gsapSetSpy.mockClear();
  });

  it('1. composite × dynamic FLY_IN → resolves to variant id, gsap.set targets variant element', () => {
    const compositeId = 'comp1';
    const dynamicVariantId = 'img-dyn';
    const classicVariantId = 'img-classic';
    const composite = makeComposite(compositeId, [
      { id: classicVariantId, type: 'image', edition: 'classic' },
      { id: dynamicVariantId, type: 'image', edition: 'dynamic' },
    ]);
    const anim = makeAnim(1, compositeId, 'composite', EFFECT_TYPE.FLY_IN);

    // Only the dynamic variant element is registered (player edition filter
    // would skip rendering the classic variant). The composite id is NOT
    // registered as an element.
    const dynamicEl = document.createElement('div');
    const refs = new Map<string, HTMLElement>([[dynamicVariantId, dynamicEl]]);

    applyInitialStates([anim], refs, null, undefined, { composites: [composite] }, 'dynamic');

    // gsap.set must have been called targeting the dynamic variant element,
    // NOT the composite id (which has no element).
    expect(gsapSetSpy).toHaveBeenCalledTimes(1);
    expect(gsapSetSpy).toHaveBeenCalledWith(dynamicEl, expect.objectContaining({ autoAlpha: 0 }));
  });

  it('2. composite × classic (bypassMotion) → skip initial state assignment', () => {
    const compositeId = 'comp2';
    const classicVariantId = 'img-c';
    const composite = makeComposite(compositeId, [
      { id: classicVariantId, type: 'image', edition: 'classic' },
    ]);
    const anim = makeAnim(1, compositeId, 'composite', EFFECT_TYPE.FLY_IN);

    const classicEl = document.createElement('div');
    const refs = new Map<string, HTMLElement>([[classicVariantId, classicEl]]);

    applyInitialStates([anim], refs, null, undefined, { composites: [composite] }, 'classic');

    // bypassMotion=true → no entrance initial state set (tween builder writes final state directly).
    expect(gsapSetSpy).not.toHaveBeenCalled();
  });

  it('3. composite with no slot for active edition → skip animation entirely', () => {
    const composite = makeComposite('comp3', [
      { id: 'img-only-classic', type: 'image', edition: 'classic' },
    ]);
    const anim = makeAnim(1, 'comp3', 'composite', EFFECT_TYPE.FLY_IN);

    const el = document.createElement('div');
    const refs = new Map<string, HTMLElement>([['img-only-classic', el]]);

    applyInitialStates([anim], refs, null, undefined, { composites: [composite] }, 'dynamic');

    expect(gsapSetSpy).not.toHaveBeenCalled();
  });

  it('4. non-composite target → resolves to raw target.id (regression guard)', () => {
    const anim = makeAnim(1, 'img1', 'image', EFFECT_TYPE.FLY_IN);

    const imgEl = document.createElement('div');
    const refs = new Map<string, HTMLElement>([['img1', imgEl]]);

    applyInitialStates([anim], refs, null, undefined, { composites: [] }, 'dynamic');

    expect(gsapSetSpy).toHaveBeenCalledWith(imgEl, expect.objectContaining({ autoAlpha: 0 }));
  });

  it('5. legacy call (spread/playEdition omitted) → falls back to raw target.id (back-compat)', () => {
    const anim = makeAnim(1, 'tb1', 'textbox', EFFECT_TYPE.FADE_IN);

    const tbEl = document.createElement('div');
    const refs = new Map<string, HTMLElement>([['tb1', tbEl]]);

    applyInitialStates([anim], refs, null);

    expect(gsapSetSpy).toHaveBeenCalledWith(tbEl, expect.objectContaining({ autoAlpha: 0 }));
  });
});

// Regression: headless Remotion render measures the container as 0 in the build
// layout-effect (AbsoluteFill inset:0 not yet resolved). The FLY_IN offscreen
// offset must fall back to the explicit canvasSize, else x collapses to 0 and the
// item "pops in" instead of flying (FADE_IN was immune — opacity-only). Tested at
// resolveInitialState (pure) so no real gsap/DOM is involved.
describe('resolveInitialState — zero-measured container falls back to canvasSize (FLY_IN render fix)', () => {
  function makeContainer(width: number, height: number): HTMLElement {
    const el = document.createElement('div');
    el.getBoundingClientRect = () =>
      ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    return el;
  }

  it('container measures 0 → FLY_IN offset uses canvasSize.width (x = 1920), not 0', () => {
    const anim = makeAnim(1, 'img1', 'image', EFFECT_TYPE.FLY_IN); // direction:'left'
    const props = resolveInitialState(anim, makeContainer(0, 0), { width: 1920, height: 1440 });
    // calculateFlyOffset('left') = { x: -cw }; resolveInitialState negates → x = cw.
    expect(props).toMatchObject({ autoAlpha: 0, x: 1920 });
  });

  it('container measures >0 → FLY_IN offset uses measured size (x = 893), not canvasSize', () => {
    const anim = makeAnim(1, 'img1', 'image', EFFECT_TYPE.FLY_IN);
    const props = resolveInitialState(anim, makeContainer(893, 670), { width: 1920, height: 1440 });
    expect(props).toMatchObject({ autoAlpha: 0, x: 893 });
  });

  it('no container → falls back to canvasSize (x = 1920)', () => {
    const anim = makeAnim(1, 'img1', 'image', EFFECT_TYPE.FLY_IN);
    const props = resolveInitialState(anim, null, { width: 1920, height: 1440 });
    expect(props).toMatchObject({ autoAlpha: 0, x: 1920 });
  });
});
