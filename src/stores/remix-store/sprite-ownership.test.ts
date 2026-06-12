// sprite-ownership.test.ts — Cross-sprite is_final mutex helpers.

import { describe, it, expect } from 'vitest';
import type { RemixSpriteEntry, SwapResultSpriteCrop } from '@/types/remix';
import {
  resolveSpriteOwners,
  applySpriteTakeFinalBack,
  reconcileOrphanSpriteFinals,
  spriteOwnerKey,
} from './sprite-ownership';

function crop(objectKey: string, variantKey: string, isFinal?: boolean): SwapResultSpriteCrop {
  const c: SwapResultSpriteCrop = {
    type: 'character',
    object_key: objectKey,
    variant_key: variantKey,
    geometry: { x: 0, y: 0, w: 10, h: 10 },
    media_url: `${objectKey}/${variantKey}`,
  };
  if (isFinal !== undefined) c.is_final = isFinal;
  return c;
}

function sprite(id: string, order: number, crops: SwapResultSpriteCrop[]): RemixSpriteEntry {
  return {
    id,
    order,
    name: `Sprite ${order}`,
    crop_sheets: [
      {
        title: 'sheet 1',
        sheet_geometry: { width: 100, height: 100 },
        image_url: '',
        original_crops: [],
        swap_results: [{ media_url: 'u', created_time: '', is_selected: true, crops }],
      },
    ],
  };
}

// ── resolveSpriteOwners ──────────────────────────────────────────────────────

describe('resolveSpriteOwners', () => {
  it('maps cellKey → owner sprite, highest order wins', () => {
    const owners = resolveSpriteOwners([
      sprite('s1', 0, [crop('c', 'v', true)]),
      sprite('s2', 1, [crop('c', 'v', true)]),
    ]);
    const key = spriteOwnerKey('character', 'c', 'v');
    expect(owners.get(key)?.spriteId).toBe('s2');
  });

  it('empty when no finals', () => {
    expect(resolveSpriteOwners([sprite('s1', 0, [crop('c', 'v')])]).size).toBe(0);
  });
});

// ── applySpriteTakeFinalBack ─────────────────────────────────────────────────

describe('applySpriteTakeFinalBack', () => {
  it('sets is_final on target sprite, clears it elsewhere', () => {
    const sprites = [
      sprite('s1', 0, [crop('c', 'v', true)]),
      sprite('s2', 1, [crop('c', 'v', false)]),
    ];
    const next = applySpriteTakeFinalBack(sprites, 'character', 'c', 'v', 's2')!;
    const finalOf = (id: string) =>
      next.find((s) => s.id === id)!.crop_sheets[0].swap_results[0].crops[0].is_final;
    expect(finalOf('s2')).toBe(true);
    expect(finalOf('s1')).toBe(false);
  });

  it('returns null when sprite/cell missing', () => {
    const sprites = [sprite('s1', 0, [crop('c', 'v', true)])];
    expect(applySpriteTakeFinalBack(sprites, 'character', 'c', 'v', 'nope')).toBeNull();
    expect(applySpriteTakeFinalBack(sprites, 'character', 'zzz', 'v', 's1')).toBeNull();
  });
});

// ── reconcileOrphanSpriteFinals ──────────────────────────────────────────────

describe('reconcileOrphanSpriteFinals', () => {
  it('no-op (changed=false) when invariant already holds', () => {
    const res = reconcileOrphanSpriteFinals([sprite('s1', 0, [crop('c', 'v', true)])]);
    expect(res.changed).toBe(false);
  });

  it('claims an orphan cell (no winner) → highest order', () => {
    const res = reconcileOrphanSpriteFinals([
      sprite('s1', 0, [crop('c', 'v', false)]),
      sprite('s2', 1, [crop('c', 'v', false)]),
    ]);
    expect(res.changed).toBe(true);
    expect(res.log.claimed).toBe(1);
    const finalOf = (id: string) =>
      res.sprites.find((s) => s.id === id)!.crop_sheets[0].swap_results[0].crops[0].is_final;
    expect(finalOf('s2')).toBe(true);
    expect(finalOf('s1')).toBe(false);
  });

  it('collapses duplicate finals to one winner', () => {
    const res = reconcileOrphanSpriteFinals([
      sprite('s1', 0, [crop('c', 'v', true)]),
      sprite('s2', 1, [crop('c', 'v', true)]),
    ]);
    expect(res.changed).toBe(true);
    expect(res.log.defensiveCleared).toBe(1);
    const finalOf = (id: string) =>
      res.sprites.find((s) => s.id === id)!.crop_sheets[0].swap_results[0].crops[0].is_final;
    expect(finalOf('s2')).toBe(true);
    expect(finalOf('s1')).toBe(false);
  });
});
