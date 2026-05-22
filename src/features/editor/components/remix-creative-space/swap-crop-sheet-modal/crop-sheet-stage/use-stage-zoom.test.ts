// use-stage-zoom.test.ts — Unit tests for the pure helpers of use-stage-zoom.ts
// (design 05-03-crop-sheet-stage.md §4.2 fit, §4.3 anchor, §4.8 edge cases).
//
// Scope: the three exported pure helpers — computeFitZoom (pure),
// applyZoomKeepingViewportCenter + clampScroll (mutate a viewport element,
// deterministic). The `useStageZoom` hook itself is effect-based and verified
// manually in Phase 02; not covered here.
//
// jsdom does not let tests set scrollWidth/clientWidth on a real element
// (the getters return 0), so a 6-property stub stands in for the viewport.

import { describe, it, expect } from 'vitest';
import {
  computeFitZoom,
  applyZoomKeepingViewportCenter,
  clampScroll,
} from './use-stage-zoom';
import { ZOOM } from '../swap-modal-constants';

// ── Viewport stub ─────────────────────────────────────────────────────────────

interface ViewportStub {
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  scrollLeft: number;
  scrollTop: number;
}

/** Builds a viewport stub; the helpers only touch these six properties. */
function makeViewport(over: Partial<ViewportStub>): ViewportStub {
  return {
    clientWidth: 0,
    clientHeight: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    scrollLeft: 0,
    scrollTop: 0,
    ...over,
  };
}

/** Casts a stub to HTMLElement — the helpers never reach beyond the 6 props. */
function asEl(stub: ViewportStub): HTMLElement {
  return stub as unknown as HTMLElement;
}

// ── computeFitZoom ────────────────────────────────────────────────────────────

describe('computeFitZoom', () => {
  it('returns null when sheet is null', () => {
    expect(computeFitZoom({ width: 900, height: 600 }, null)).toBeNull();
  });

  it('returns null for a degenerate sheet (width or height <= 0)', () => {
    expect(
      computeFitZoom({ width: 900, height: 600 }, { width: 0, height: 500 }),
    ).toBeNull();
    expect(
      computeFitZoom({ width: 900, height: 600 }, { width: 1000, height: 0 }),
    ).toBeNull();
  });

  it('returns null when the viewport is not measured yet (0×0)', () => {
    expect(
      computeFitZoom({ width: 0, height: 0 }, { width: 1000, height: 500 }),
    ).toBeNull();
  });

  it('fits to the constraining axis (width-bound)', () => {
    // scaleX = 900/1000 = 0.9, scaleY = 600/500 = 1.2 → min 0.9 → 90%.
    expect(
      computeFitZoom({ width: 900, height: 600 }, { width: 1000, height: 500 }),
    ).toBe(90);
  });

  it('snaps DOWN to a ZOOM.step multiple (floor, not round)', () => {
    // scaleX = 837/1000 = 0.837 → 83.7% → floor to step 5 → 80% (NOT 85%).
    expect(
      computeFitZoom({ width: 837, height: 600 }, { width: 1000, height: 500 }),
    ).toBe(80);
  });

  it('clamps a huge sheet up to ZOOM.min', () => {
    // 100/5000 = 0.02 → 2% → floor → 0 → clamped up to ZOOM.min.
    expect(
      computeFitZoom({ width: 100, height: 100 }, { width: 5000, height: 3000 }),
    ).toBe(ZOOM.min);
  });

  it('clamps a tiny sheet down to ZOOM.max', () => {
    // 4000/100 = 40 → 4000% → clamped down to ZOOM.max.
    expect(
      computeFitZoom({ width: 4000, height: 4000 }, { width: 100, height: 80 }),
    ).toBe(ZOOM.max);
  });

  it('returns 100 for an exact fit', () => {
    expect(
      computeFitZoom(
        { width: 1000, height: 500 },
        { width: 1000, height: 500 },
      ),
    ).toBe(100);
  });
});

// ── applyZoomKeepingViewportCenter ────────────────────────────────────────────

describe('applyZoomKeepingViewportCenter', () => {
  it('is a no-op when prevZoom === nextZoom', () => {
    const vp = makeViewport({
      clientWidth: 400,
      scrollWidth: 800,
      scrollLeft: 120,
      scrollTop: 80,
    });
    applyZoomKeepingViewportCenter(asEl(vp), 100, 100);
    expect(vp.scrollLeft).toBe(120);
    expect(vp.scrollTop).toBe(80);
  });

  it('is a no-op when prevZoom <= 0 (divide-by-zero guard)', () => {
    const vp = makeViewport({ scrollLeft: 50, scrollTop: 50 });
    applyZoomKeepingViewportCenter(asEl(vp), 0, 200);
    expect(vp.scrollLeft).toBe(50);
    expect(vp.scrollTop).toBe(50);
  });

  it('keeps the viewport-center point fixed when zooming in from origin', () => {
    // Center point = 0 + 200 = 200; after 2× it sits at 400 → scroll 200.
    const vp = makeViewport({
      clientWidth: 400,
      clientHeight: 400,
      scrollWidth: 800,
      scrollHeight: 800,
      scrollLeft: 0,
      scrollTop: 0,
    });
    applyZoomKeepingViewportCenter(asEl(vp), 100, 200);
    expect(vp.scrollLeft).toBe(200);
    expect(vp.scrollTop).toBe(200);
  });

  it('clamps to the max scroll when zooming in near a corner', () => {
    // Center = 400 + 200 = 600; ×4 → 2400 − 200 = 2200, clamped to 1600−400.
    const vp = makeViewport({
      clientWidth: 400,
      clientHeight: 400,
      scrollWidth: 1600,
      scrollHeight: 1600,
      scrollLeft: 400,
      scrollTop: 400,
    });
    applyZoomKeepingViewportCenter(asEl(vp), 100, 400);
    expect(vp.scrollLeft).toBe(1200);
    expect(vp.scrollTop).toBe(1200);
  });

  it('clamps to 0 when the zoomed content is smaller than the viewport', () => {
    const vp = makeViewport({
      clientWidth: 800,
      clientHeight: 800,
      scrollWidth: 400,
      scrollHeight: 400,
      scrollLeft: 0,
      scrollTop: 0,
    });
    applyZoomKeepingViewportCenter(asEl(vp), 100, 50);
    expect(vp.scrollLeft).toBe(0);
    expect(vp.scrollTop).toBe(0);
  });

  it('always lands within [0, scrollWidth − clientWidth]', () => {
    const vp = makeViewport({
      clientWidth: 400,
      clientHeight: 400,
      scrollWidth: 1600,
      scrollHeight: 1600,
      scrollLeft: 350,
      scrollTop: 350,
    });
    applyZoomKeepingViewportCenter(asEl(vp), 100, 300);
    expect(vp.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(vp.scrollLeft).toBeLessThanOrEqual(1600 - 400);
    expect(vp.scrollTop).toBeGreaterThanOrEqual(0);
    expect(vp.scrollTop).toBeLessThanOrEqual(1600 - 400);
  });
});

// ── clampScroll ───────────────────────────────────────────────────────────────

describe('clampScroll', () => {
  it('leaves a scroll offset already in range untouched', () => {
    const vp = makeViewport({
      clientWidth: 400,
      clientHeight: 400,
      scrollWidth: 800,
      scrollHeight: 800,
      scrollLeft: 100,
      scrollTop: 100,
    });
    clampScroll(asEl(vp));
    expect(vp.scrollLeft).toBe(100);
    expect(vp.scrollTop).toBe(100);
  });

  it('clamps an out-of-range offset down to the max', () => {
    const vp = makeViewport({
      clientWidth: 400,
      clientHeight: 400,
      scrollWidth: 800,
      scrollHeight: 800,
      scrollLeft: 600,
      scrollTop: 600,
    });
    clampScroll(asEl(vp));
    expect(vp.scrollLeft).toBe(400);
    expect(vp.scrollTop).toBe(400);
  });

  it('clamps to 0 when content is smaller than the viewport (negative max)', () => {
    const vp = makeViewport({
      clientWidth: 800,
      clientHeight: 800,
      scrollWidth: 400,
      scrollHeight: 400,
      scrollLeft: 50,
      scrollTop: 50,
    });
    clampScroll(asEl(vp));
    expect(vp.scrollLeft).toBe(0);
    expect(vp.scrollTop).toBe(0);
  });
});
