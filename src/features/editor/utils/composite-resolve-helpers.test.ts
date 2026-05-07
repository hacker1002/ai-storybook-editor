// composite-resolve-helpers.test.ts - Unit tests for Phase 6 runtime override helpers.

import { describe, it, expect } from 'vitest';
import {
  buildEditorCompositeContextMap,
  buildPlayerCompositeContextMap,
  resolveEffectiveZIndex,
  resolveAnimationTarget,
  isVariantInAnyComposite,
} from './composite-resolve-helpers';
import type { BaseSpread, SpreadComposite } from '@/types/spread-types';

function makeComposite(
  id: string,
  zIndex: number,
  variants: Array<{ id: string; type: 'image' | 'auto_pic'; edition: 'classic' | 'dynamic' | 'interactive' }>
): SpreadComposite {
  return {
    id,
    title: id,
    'z-index': zIndex,
    variants,
  };
}

function makeSpread(composites: SpreadComposite[]): Pick<BaseSpread, 'composites'> {
  return { composites };
}

describe('composite-resolve-helpers', () => {
  describe('buildEditorCompositeContextMap', () => {
    it('1. composite with 2 variants → 2 entries with composite z-index', () => {
      const spread = makeSpread([
        makeComposite('c1', 50, [
          { id: 'img1', type: 'image', edition: 'classic' },
          { id: 'ap1', type: 'auto_pic', edition: 'dynamic' },
        ]),
      ]);
      const map = buildEditorCompositeContextMap(spread);
      expect(map.size).toBe(2);
      expect(map.get('img1')?.override['z-index']).toBe(50);
      expect(map.get('ap1')?.override['z-index']).toBe(50);
      expect(map.get('img1')?.compositeId).toBe('c1');
      expect(map.get('img1')?.edition).toBe('classic');
    });

    it('2. duplicate variant id across edition slots → first-wins (1 entry per id)', () => {
      // Same variant id (e.g. shared across editions) — only 1 entry.
      const spread = makeSpread([
        makeComposite('c1', 100, [
          { id: 'img-shared', type: 'image', edition: 'classic' },
          { id: 'img-shared', type: 'image', edition: 'dynamic' },
        ]),
      ]);
      const map = buildEditorCompositeContextMap(spread);
      expect(map.size).toBe(1);
      expect(map.get('img-shared')?.edition).toBe('classic'); // first-wins
    });

    it('3. no composites → empty map', () => {
      expect(buildEditorCompositeContextMap({ composites: undefined }).size).toBe(0);
      expect(buildEditorCompositeContextMap({ composites: [] }).size).toBe(0);
    });
  });

  describe('buildPlayerCompositeContextMap', () => {
    it('4. edition=classic → only classic variant maps; dynamic skipped', () => {
      const spread = makeSpread([
        makeComposite('c1', 75, [
          { id: 'img-classic', type: 'image', edition: 'classic' },
          { id: 'ap-dyn', type: 'auto_pic', edition: 'dynamic' },
        ]),
      ]);
      const map = buildPlayerCompositeContextMap(spread, 'classic');
      expect(map.size).toBe(1);
      expect(map.has('img-classic')).toBe(true);
      expect(map.has('ap-dyn')).toBe(false);
      expect(map.get('img-classic')?.override['z-index']).toBe(75);
    });

    it('5. edition=dynamic, composite has no dynamic variant → empty map', () => {
      const spread = makeSpread([
        makeComposite('c1', 10, [
          { id: 'img1', type: 'image', edition: 'classic' },
        ]),
      ]);
      const map = buildPlayerCompositeContextMap(spread, 'dynamic');
      expect(map.size).toBe(0);
    });
  });

  describe('resolveEffectiveZIndex', () => {
    it('6. variant in composite → override z-index; standalone → own z-index', () => {
      const spread = makeSpread([
        makeComposite('c1', 99, [
          { id: 'img1', type: 'image', edition: 'classic' },
        ]),
      ]);
      const map = buildEditorCompositeContextMap(spread);
      expect(resolveEffectiveZIndex({ id: 'img1', 'z-index': 5 }, map)).toBe(99);
      expect(resolveEffectiveZIndex({ id: 'standalone', 'z-index': 7 }, map)).toBe(7);
      expect(resolveEffectiveZIndex({ id: 'no-z' }, map)).toBe(0);
    });
  });

  describe('resolveAnimationTarget', () => {
    const spread = makeSpread([
      makeComposite('c1', 30, [
        { id: 'img-c', type: 'image', edition: 'classic' },
        { id: 'ap-d', type: 'auto_pic', edition: 'dynamic' },
        { id: 'img-i', type: 'image', edition: 'interactive' },
      ]),
    ]);

    it('7. non-composite target → pass-through, no bypass', () => {
      const r = resolveAnimationTarget({ id: 'img1', type: 'image' }, spread, 'classic');
      expect(r.variantId).toBe('img1');
      expect(r.bypassMotion).toBe(false);
    });

    it('8. composite target, edition=classic → variant id resolved + bypassMotion=true', () => {
      const r = resolveAnimationTarget({ id: 'c1', type: 'composite' }, spread, 'classic');
      expect(r.variantId).toBe('img-c');
      expect(r.bypassMotion).toBe(true);
    });

    it('9. composite target, edition=dynamic → variant id resolved, full motion', () => {
      const r = resolveAnimationTarget({ id: 'c1', type: 'composite' }, spread, 'dynamic');
      expect(r.variantId).toBe('ap-d');
      expect(r.bypassMotion).toBe(false);
    });

    it('10. composite target, edition with no matching variant → empty variantId (skip)', () => {
      const sp = makeSpread([
        makeComposite('c2', 1, [{ id: 'only-classic', type: 'image', edition: 'classic' }]),
      ]);
      const r = resolveAnimationTarget({ id: 'c2', type: 'composite' }, sp, 'dynamic');
      expect(r.variantId).toBe('');
      expect(r.bypassMotion).toBe(false);
    });

    it('11. composite target, composite id not found → empty variantId', () => {
      const r = resolveAnimationTarget({ id: 'missing', type: 'composite' }, spread, 'classic');
      expect(r.variantId).toBe('');
    });
  });

  describe('isVariantInAnyComposite', () => {
    it('12. detects variants regardless of edition', () => {
      const spread = makeSpread([
        makeComposite('c1', 1, [
          { id: 'img1', type: 'image', edition: 'classic' },
          { id: 'ap1', type: 'auto_pic', edition: 'dynamic' },
        ]),
      ]);
      expect(isVariantInAnyComposite(spread, 'img1')).toBe(true);
      expect(isVariantInAnyComposite(spread, 'ap1')).toBe(true);
      expect(isVariantInAnyComposite(spread, 'standalone')).toBe(false);
    });
  });
});
