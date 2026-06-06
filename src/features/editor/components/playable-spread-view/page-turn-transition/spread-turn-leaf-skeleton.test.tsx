// spread-turn-leaf-skeleton.test.tsx — Attribute-level parity tests for the
// shared skeleton. Validates the 3D invariants once so both the player overlay
// and the Remotion render segment inherit them by construction (parity by
// shared component, not by hand-written assertions on each adapter).
//
// Scope (validation #3 in plan.md — "attr snapshot + still-frame, no SSIM"):
//   • Clip set per direction (front/back/static) sourced from `resolveTurnClips`.
//   • Back-face self-rotation = `rotateY(180deg)` + backface-visibility hidden.
//   • Positioner perspective always === `${PERSPECTIVE_PX}px`.
//   • Mode dispatch: `'fill'` → absolute+inset0; `DOMRect` → fixed+coords.
//   • zIndex isolation: base wrapper z0, static z1, card z1 — present when
//     baseSlot is provided.
//   • Drive contract: declarative `cardTransform`/`faceOpacity` props write
//     through; defaults (front 1 / back 0) when omitted (player mode).
//
// Reference for byte-exact clip values lives in `spread-flip-transform.test.ts`.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TurnLeafSkeleton } from './spread-turn-leaf-skeleton';
import {
  PERSPECTIVE_PX,
  resolveTurnClips,
} from './spread-flip-transform';
import { OVERLAY_Z_INDEX } from './spread-turn-constants';

const TID = {
  skeleton: 'spread-turn-skeleton',
  base: 'spread-turn-base',
  staticLayer: 'spread-turn-static-layer',
  card: 'spread-turn-flipping-card',
  front: 'spread-turn-front-face',
  back: 'spread-turn-back-face',
} as const;

function makeRect(): DOMRect {
  // Minimal DOMRect-like — jsdom doesn't expose the constructor but we only
  // read top/left/width/height + .toJSON (latter unused in skeleton).
  const r = { top: 12, left: 34, width: 800, height: 600, right: 834, bottom: 612, x: 34, y: 12 };
  return { ...r, toJSON: () => r } as DOMRect;
}

describe('TurnLeafSkeleton — attribute parity', () => {
  describe('clip set per direction', () => {
    it.each(['next', 'prev'] as const)('direction=%s wires resolveTurnClips() into front/back/static', (direction) => {
      const expected = resolveTurnClips(direction);
      const { getByTestId } = render(
        <TurnLeafSkeleton direction={direction} positioner="fill" />,
      );
      expect(getByTestId(TID.front).style.clipPath).toBe(expected.frontClip);
      expect(getByTestId(TID.back).style.clipPath).toBe(expected.backClip);
      expect(getByTestId(TID.staticLayer).style.clipPath).toBe(expected.staticClip);
    });
  });

  describe('back-face invariants (drift-prone — own them once here)', () => {
    it('back face has rotateY(180deg) and backfaceVisibility:hidden', () => {
      const { getByTestId } = render(
        <TurnLeafSkeleton direction="next" positioner="fill" />,
      );
      const back = getByTestId(TID.back);
      expect(back.style.transform).toBe('rotateY(180deg)');
      expect(back.style.backfaceVisibility).toBe('hidden');
      // jsdom normalizes the hex `PAPER_BG_COLOR` (#f4ecd8) into rgb(244,236,216).
      expect(back.style.background).toContain('rgb(244, 236, 216)');
    });

    it('front face also has backfaceVisibility:hidden (so it hides past 90°)', () => {
      const { getByTestId } = render(
        <TurnLeafSkeleton direction="next" positioner="fill" />,
      );
      expect(getByTestId(TID.front).style.backfaceVisibility).toBe('hidden');
    });
  });

  describe('positioner dispatch', () => {
    it("mode='fill' → absolute + inset:0; no fixed coords", () => {
      const { getByTestId } = render(
        <TurnLeafSkeleton direction="next" positioner="fill" />,
      );
      const root = getByTestId(TID.skeleton);
      expect(root.style.position).toBe('absolute');
      expect(root.style.inset).toBe('0px');
      expect(root.style.perspective).toBe(`${PERSPECTIVE_PX}px`);
    });

    it('mode=DOMRect → fixed + coords + overlay zIndex + pointer-events none', () => {
      const rect = makeRect();
      const { getByTestId } = render(
        <TurnLeafSkeleton direction="next" positioner={rect} />,
      );
      const root = getByTestId(TID.skeleton);
      expect(root.style.position).toBe('fixed');
      expect(root.style.top).toBe(`${rect.top}px`);
      expect(root.style.left).toBe(`${rect.left}px`);
      expect(root.style.width).toBe(`${rect.width}px`);
      expect(root.style.height).toBe(`${rect.height}px`);
      expect(root.style.zIndex).toBe(String(OVERLAY_Z_INDEX));
      expect(root.style.pointerEvents).toBe('none');
      expect(root.style.perspective).toBe(`${PERSPECTIVE_PX}px`);
    });
  });

  describe('zIndex isolation (gated on baseSlot — player path must NOT isolate)', () => {
    it('without baseSlot (player path): no base wrapper, no explicit zIndex on static/card, no overflow:hidden on faces — preserves OLD overlay behavior', () => {
      const { getByTestId, queryByTestId } = render(
        <TurnLeafSkeleton direction="next" positioner="fill" />,
      );
      expect(queryByTestId(TID.base)).toBeNull();
      // CRITICAL — adding zIndex on static OR overflow:hidden on front/back when
      // there is no baseSlot interacts with `preserve-3d`+`clip-path` and visibly
      // flattens the leaf below the live spreadContainer underneath (regression
      // 2026-06-06). Skeleton must omit these in player mode.
      expect(getByTestId(TID.staticLayer).style.zIndex).toBe('');
      expect(getByTestId(TID.staticLayer).style.overflow).toBe('');
      expect(getByTestId(TID.card).style.zIndex).toBe('');
      expect(getByTestId(TID.front).style.overflow).toBe('');
      expect(getByTestId(TID.back).style.overflow).toBe('');
    });

    it('with baseSlot (render path): base wrapper z=0 (trap), static z=1+overflow, card z=1, faces overflow:hidden — fixes incoming-video leak', () => {
      const { getByTestId } = render(
        <TurnLeafSkeleton
          direction="next"
          positioner="fill"
          baseSlot={<div data-testid="base-content" />}
        />,
      );
      const base = getByTestId(TID.base);
      expect(base.style.zIndex).toBe('0');
      expect(base.style.position).toBe('absolute');
      expect(base.style.inset).toBe('0px');
      expect(getByTestId('base-content')).toBeTruthy();
      expect(getByTestId(TID.staticLayer).style.zIndex).toBe('1');
      expect(getByTestId(TID.staticLayer).style.overflow).toBe('hidden');
      expect(getByTestId(TID.card).style.zIndex).toBe('1');
      expect(getByTestId(TID.front).style.overflow).toBe('hidden');
      expect(getByTestId(TID.back).style.overflow).toBe('hidden');
    });
  });

  describe('drive contract (declarative vs imperative)', () => {
    it("declarative (render): cardTransform + faceOpacity wire through", () => {
      const { getByTestId } = render(
        <TurnLeafSkeleton
          direction="next"
          positioner="fill"
          cardTransform="rotateY(-45deg)"
          faceOpacity={{ front: 0.3, back: 0.7 }}
          baseSlot={<div />}
        />,
      );
      expect(getByTestId(TID.card).style.transform).toBe('rotateY(-45deg)');
      expect(getByTestId(TID.front).style.opacity).toBe('0.3');
      expect(getByTestId(TID.back).style.opacity).toBe('0.7');
    });

    it("imperative (player): omitted props → defaults (front 1, back 0); card style has NO `transform` key so GSAP owns it", () => {
      const { getByTestId } = render(
        <TurnLeafSkeleton direction="next" positioner="fill" />,
      );
      // Skeleton must NOT emit a React-controlled `transform` style key when
      // cardTransform is undefined — React would diff-and-write `transform: ''`
      // on re-render, nuking GSAP's inline write.
      expect(getByTestId(TID.card).style.transform).toBe('');
      expect(getByTestId(TID.front).style.opacity).toBe('1');
      expect(getByTestId(TID.back).style.opacity).toBe('0');
    });
  });

  describe('card invariants (single source for 3D context)', () => {
    it('preserve-3d + transformOrigin at gutter (50% 50%) + willChange:transform', () => {
      const { getByTestId } = render(
        <TurnLeafSkeleton direction="next" positioner="fill" />,
      );
      const card = getByTestId(TID.card);
      expect(card.style.transformStyle).toBe('preserve-3d');
      expect(card.style.transformOrigin).toBe('50% 50%');
      expect(card.style.willChange).toBe('transform');
    });

    it('position:absolute + inset:0 — REQUIRED so zIndex:1 (render mode) takes effect; static-positioned elements ignore z-index and the card slips beneath base+static (regression 2026-06-06: NEW-left back-face reveal invisible)', () => {
      const { getByTestId } = render(
        <TurnLeafSkeleton
          direction="next"
          positioner="fill"
          baseSlot={<div />}
        />,
      );
      const card = getByTestId(TID.card);
      expect(card.style.position).toBe('absolute');
      expect(card.style.inset).toBe('0px');
    });
  });
});
