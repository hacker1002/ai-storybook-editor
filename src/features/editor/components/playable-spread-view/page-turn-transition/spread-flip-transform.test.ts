// spread-flip-transform.test.ts — verifies the baked power2 easing + hard face-swap.
import { describe, it, expect } from 'vitest';
import {
  computeFlipTransform,
  resolveTurnClips,
  PERSPECTIVE_PX,
  LAYOUT_PIVOT_MAP,
} from './spread-flip-transform';

describe('computeFlipTransform', () => {
  it('p=0 → start: no rotation, front visible, back hidden', () => {
    const t = computeFlipTransform(0, 'next', 'spread');
    expect(t.rotateY_deg).toBeCloseTo(0, 6);
    expect(t.frontOpacity).toBe(1);
    expect(t.backOpacity).toBe(0);
    expect(t.transformOrigin).toBe(LAYOUT_PIVOT_MAP.spread);
    expect(t.perspective_px).toBe(PERSPECTIVE_PX);
  });

  it('p=0.25 → phase1 power2.in (t²): rotateY = sign*90*(0.5)² = -22.5 for next', () => {
    const t = computeFlipTransform(0.25, 'next', 'spread');
    // p1 = 0.5 → rotateY = -90 * 0.25 = -22.5
    expect(t.rotateY_deg).toBeCloseTo(-22.5, 6);
    expect(t.frontOpacity).toBe(1);
    expect(t.backOpacity).toBe(0);
  });

  it('p=0.5 → HARD swap at edge-on: front 1→0, back 0→1, rotateY = ±90', () => {
    const t = computeFlipTransform(0.5, 'next', 'spread');
    // PHASE2 branch entered at exactly 0.5: p2=0 → rotateY = sign*(90 + 0) = -90
    expect(t.rotateY_deg).toBeCloseTo(-90, 6);
    expect(t.frontOpacity).toBe(0);
    expect(t.backOpacity).toBe(1);
  });

  it('p=0.75 → phase2 power2.out: rotateY = sign*(90+90*(1-(1-0.5)²)) = -157.5 for next', () => {
    const t = computeFlipTransform(0.75, 'next', 'spread');
    // p2 = 0.5 → eased = 1 - 0.25 = 0.75 → rotateY = -(90 + 67.5) = -157.5
    expect(t.rotateY_deg).toBeCloseTo(-157.5, 6);
    expect(t.frontOpacity).toBe(0);
    expect(t.backOpacity).toBe(1);
  });

  it('p=1 → end: rotateY = ±180', () => {
    expect(computeFlipTransform(1, 'next', 'spread').rotateY_deg).toBeCloseTo(-180, 6);
    expect(computeFlipTransform(1, 'prev', 'spread').rotateY_deg).toBeCloseTo(180, 6);
  });

  it('prev direction mirrors next with +sign', () => {
    expect(computeFlipTransform(0.25, 'prev', 'spread').rotateY_deg).toBeCloseTo(22.5, 6);
    expect(computeFlipTransform(0.5, 'prev', 'spread').rotateY_deg).toBeCloseTo(90, 6);
    expect(computeFlipTransform(0.75, 'prev', 'spread').rotateY_deg).toBeCloseTo(157.5, 6);
  });

  it('rotateY is monotonic + continuous 0 → -180 across the flip (next)', () => {
    let prev = 0;
    for (let i = 0; i <= 100; i++) {
      const p = i / 100;
      const cur = computeFlipTransform(p, 'next', 'spread').rotateY_deg;
      // non-increasing (next sweeps 0 → -180)
      expect(cur).toBeLessThanOrEqual(prev + 1e-9);
      prev = cur;
    }
    expect(prev).toBeCloseTo(-180, 6);
  });

  it('clamps out-of-range progress', () => {
    expect(computeFlipTransform(-1, 'next', 'spread').rotateY_deg).toBeCloseTo(0, 6);
    expect(computeFlipTransform(2, 'next', 'spread').rotateY_deg).toBeCloseTo(-180, 6);
  });
});

describe('resolveTurnClips', () => {
  const RIGHT = 'inset(0 0 0 50%)';
  const LEFT = 'inset(0 50% 0 0)';

  it('next: front=right half, static=left half, back=inverse(front)=left half', () => {
    const c = resolveTurnClips('next');
    expect(c.frontClip).toBe(RIGHT);
    expect(c.staticClip).toBe(LEFT);
    expect(c.backClip).toBe(LEFT);
  });

  it('prev mirrors next', () => {
    const c = resolveTurnClips('prev');
    expect(c.frontClip).toBe(LEFT);
    expect(c.staticClip).toBe(RIGHT);
    expect(c.backClip).toBe(RIGHT);
  });

  it('back is the inverse half of front; static pins the half the back lands on', () => {
    for (const dir of ['next', 'prev'] as const) {
      const c = resolveTurnClips(dir);
      expect(c.backClip).not.toBe(c.frontClip); // inverse halves
      expect(c.staticClip).toBe(c.backClip);    // static + back share the incoming half
    }
  });
});
