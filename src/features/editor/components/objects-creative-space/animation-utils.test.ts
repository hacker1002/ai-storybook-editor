// utils.test.ts — Unit tests for animation utility functions.

import { describe, it, expect } from 'vitest';
import {
  buildDefaultEffect,
  resolveAnimations,
  inferEffectTypeForComposite,
} from './animation-utils';
import type { SpreadAnimation, SpreadComposite } from '@/types/spread-types';

describe('buildDefaultEffect', () => {
  describe('Lines (type 16) with itemGeometry', () => {
    it('places tip at spread center, mirrors item w/h', () => {
      const itemGeom = { x: 10, y: 10, w: 20, h: 30 };
      const effect = buildDefaultEffect(16, 1, itemGeom);
      // tip @ spread center: x = 50 - 20/2 = 40, y = 50 - 30/2 = 35
      expect(effect.geometry).toEqual({
        x: 40,
        y: 35,
        w: 20,
        h: 30,
      });
      expect(effect.type).toBe(16);
    });

    it('handles square item geometry', () => {
      const itemGeom = { x: 0, y: 0, w: 50, h: 50 };
      const effect = buildDefaultEffect(16, 1, itemGeom);
      // x = 50 - 50/2 = 25, y = 50 - 50/2 = 25
      expect(effect.geometry).toEqual({
        x: 25,
        y: 25,
        w: 50,
        h: 50,
      });
    });

    it('handles small item geometry', () => {
      const itemGeom = { x: 5, y: 5, w: 10, h: 15 };
      const effect = buildDefaultEffect(16, 1, itemGeom);
      // x = 50 - 10/2 = 45, y = 50 - 15/2 = 42.5
      expect(effect.geometry).toEqual({
        x: 45,
        y: 42.5,
        w: 10,
        h: 15,
      });
    });
  });

  describe('Lines (type 16) without itemGeometry', () => {
    it('uses fallback geometry {x:40, y:40, w:20, h:20}', () => {
      const effect = buildDefaultEffect(16, 1);
      expect(effect.geometry).toEqual({
        x: 40,
        y: 40,
        w: 20,
        h: 20,
      });
    });

    it('ignores spreadRatio when itemGeometry absent', () => {
      const effect1 = buildDefaultEffect(16, 0.5);
      const effect2 = buildDefaultEffect(16, 2);
      expect(effect1.geometry).toEqual(effect2.geometry);
    });
  });

  describe('Camera Zoom (type 19)', () => {
    it('uses buildDefaultZoomGeometry based on spreadRatio', () => {
      const effect = buildDefaultEffect(19, 2);
      expect(effect.geometry).toBeDefined();
      // Camera zoom should have w = h (centered 50% × 50% square)
      expect(effect.geometry?.w).toBe(50);
      expect(effect.geometry?.h).toBe(50);
      expect(effect.geometry?.x).toBeCloseTo(25, 5);
      expect(effect.geometry?.y).toBeCloseTo(25, 5);
    });

    it('ignores itemGeometry for Camera Zoom', () => {
      const effect1 = buildDefaultEffect(19, 1);
      const effect2 = buildDefaultEffect(19, 1, { x: 0, y: 0, w: 100, h: 100 });
      expect(effect1.geometry).toEqual(effect2.geometry);
    });
  });

  describe('Other effect types (no geometry)', () => {
    it('Appear (type 2) has no geometry field', () => {
      const effect = buildDefaultEffect(2);
      expect(effect.geometry).toBeUndefined();
    });

    it('Fade In (type 3) has no geometry field', () => {
      const effect = buildDefaultEffect(3);
      expect(effect.geometry).toBeUndefined();
    });

    it('Fly In (type 5) has no geometry field', () => {
      const effect = buildDefaultEffect(5);
      expect(effect.geometry).toBeUndefined();
    });
  });

  describe('effect properties', () => {
    it('includes delay: 0', () => {
      const effect = buildDefaultEffect(16);
      expect(effect.delay).toBe(0);
    });

    it('includes duration for appropriate types', () => {
      const effect16 = buildDefaultEffect(16);
      expect(effect16.duration).toBeDefined();

      const effect19 = buildDefaultEffect(19);
      expect(effect19.duration).toBeDefined();
      // Camera zoom should have longer duration
      expect(effect19.duration).toBe(3000);
    });

    it('includes direction for types that support it (e.g. Fly In)', () => {
      const effect = buildDefaultEffect(5); // Fly In
      expect(effect.direction).toBeDefined();
    });
  });

  describe('Lines (type 16) with various spreadRatios', () => {
    it('ignores spreadRatio when itemGeometry provided', () => {
      const itemGeom = { x: 10, y: 10, w: 20, h: 30 };
      const effect1 = buildDefaultEffect(16, 0.5, itemGeom);
      const effect2 = buildDefaultEffect(16, 2, itemGeom);
      expect(effect1.geometry).toEqual(effect2.geometry);
    });
  });
});

describe('resolveAnimations', () => {
  it('resolves basic animation with title and effect name', () => {
    const animations: SpreadAnimation[] = [
      {
        order: 1,
        type: 0,
        target: { id: 'img1', type: 'image' },
        trigger_type: 'on_next',
        effect: { type: 3 },
      },
    ];
    const itemsMap = new Map([['img1', { title: 'Hero Image', type: 'image' }]]);

    const resolved = resolveAnimations(animations, itemsMap);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].displayTitle).toContain('Hero Image');
    expect(resolved[0].targetItemName).toBe('Hero Image');
  });
});

describe('inferEffectTypeForComposite', () => {
  it('returns auto_pic when any variant is auto_pic', () => {
    const composite: SpreadComposite = {
      id: 'comp1',
      title: 'Composite 1',
      'z-index': 0,
      variants: [
        { id: 'v1', type: 'image', edition: 'classic' },
        { id: 'v2', type: 'auto_pic', edition: 'dynamic' },
      ],
    };
    const result = inferEffectTypeForComposite(composite);
    expect(result).toBe('auto_pic');
  });

  it('returns image when all variants are image', () => {
    const composite: SpreadComposite = {
      id: 'comp1',
      title: 'Composite 1',
      'z-index': 0,
      variants: [
        { id: 'v1', type: 'image', edition: 'classic' },
        { id: 'v2', type: 'image', edition: 'dynamic' },
      ],
    };
    const result = inferEffectTypeForComposite(composite);
    expect(result).toBe('image');
  });
});
