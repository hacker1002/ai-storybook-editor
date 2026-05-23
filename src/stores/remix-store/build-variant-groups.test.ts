// build-variant-groups.test.ts — Unit tests for the variant-group projection,
// focused on `visualSwapUrl` surfacing (Phase 01 — character crop-sheet swap).

import { describe, it, expect } from 'vitest';
import { buildVariantGroups, type EntityLike, type VariantLike } from './build-variant-groups';
import type { RemixCropSheet } from '@/types/remix';

function sheet(variantKey: string | null): RemixCropSheet {
  return {
    title: '',
    sheet_geometry: { width: 100, height: 100 },
    image_url: '',
    swap_results: [],
    crops: [],
    variant_key: variantKey,
  };
}

function charEntity(crop_sheets: RemixCropSheet[]): EntityLike {
  return { type: 'character', key: 'elara', crop_sheets };
}

describe('buildVariantGroups — visualSwapUrl', () => {
  it('surfaces visual_swap_url from the matching raw variant', () => {
    const variants: VariantLike[] = [
      { key: 'v1', name: 'Day', visual_swap_url: 'https://x/day.png' },
      { key: 'v2', name: 'Night', visual_swap_url: 'https://x/night.png' },
    ];
    const groups = buildVariantGroups(
      charEntity([sheet('v1'), sheet('v2'), sheet('v1')]),
      variants,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      variantKey: 'v1',
      sheetIndices: [0, 2],
      visualSwapUrl: 'https://x/day.png',
    });
    expect(groups[1]).toMatchObject({
      variantKey: 'v2',
      sheetIndices: [1],
      visualSwapUrl: 'https://x/night.png',
    });
  });

  it('emits visualSwapUrl=null when the raw variant has none', () => {
    const groups = buildVariantGroups(charEntity([sheet('v1')]), [
      { key: 'v1', name: 'Day' }, // no visual_swap_url
    ]);
    expect(groups[0].visualSwapUrl).toBeNull();
  });

  it('preserves raw-variant order regardless of sheet order', () => {
    const variants: VariantLike[] = [
      { key: 'v2', visual_swap_url: 'b' },
      { key: 'v1', visual_swap_url: 'a' },
    ];
    const groups = buildVariantGroups(charEntity([sheet('v1'), sheet('v2')]), variants);
    expect(groups.map((g) => g.variantKey)).toEqual(['v2', 'v1']);
  });

  it('returns [] for mix entity (no variants concept)', () => {
    const groups = buildVariantGroups(
      { type: 'mix', key: 'a-b', crop_sheets: [sheet(null)] },
      null,
    );
    expect(groups).toEqual([]);
  });
});
