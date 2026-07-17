// Covers the Lineup read-path: effectiveCropUrl (which crop/illustration wins) + the
// useSketchLineupEntries projection (base INCLUDED, snapshot order, height pass-through).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/apis/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    from: vi.fn(),
  },
}));

import { useSnapshotStore } from '@/stores/snapshot-store';
import { effectiveCropUrl, useSketchLineupEntries } from '@/stores/snapshot-store/selectors';
import type { SketchEntity, SketchVariant, SketchVariantCrop } from '@/types/sketch';
import type { Illustration } from '@/types/prop-types';

const illustration = (media_url: string, is_selected = false): Illustration => ({
  media_url,
  created_time: '2026-07-17T00:00:00Z',
  is_selected,
});

const crop = (is_selected: boolean, illustrations: Illustration[]): SketchVariantCrop => ({
  is_selected,
  illustrations,
});

const variant = (key: string, opts: Partial<SketchVariant> = {}): SketchVariant => ({
  key,
  description: '',
  visual_design: '',
  art_language: '',
  ...opts,
});

const setSketchEntities = (kind: 'characters' | 'props', entities: SketchEntity[]) => {
  act(() => {
    useSnapshotStore.setState((s) => {
      s.sketch[kind] = entities;
    });
  });
};

describe('effectiveCropUrl', () => {
  it('returns the selected illustration of the selected crop', () => {
    const v = variant('fairy', {
      raw_sheet: {
        illustrations: [],
        crops: [
          crop(false, [illustration('not-me.png', true)]),
          crop(true, [illustration('newest.png'), illustration('locked.png', true)]),
        ],
      },
    });
    expect(effectiveCropUrl(v)).toBe('locked.png');
  });

  it('falls back to the newest illustration when the selected crop has none locked', () => {
    const v = variant('fairy', {
      raw_sheet: { illustrations: [], crops: [crop(true, [illustration('newest.png'), illustration('older.png')])] },
    });
    expect(effectiveCropUrl(v)).toBe('newest.png');
  });

  it('resolves the base variant via its cloned crop (same read-path)', () => {
    const v = variant('base', {
      raw_sheet: { illustrations: [], crops: [crop(true, [illustration('base-clone.png', true)])] },
    });
    expect(effectiveCropUrl(v)).toBe('base-clone.png');
  });

  it('returns null when NO crop is_selected', () => {
    const v = variant('fairy', {
      raw_sheet: { illustrations: [], crops: [crop(false, [illustration('a.png', true)]), crop(false, [])] },
    });
    expect(effectiveCropUrl(v)).toBeNull();
  });

  it('returns null when the selected crop has no illustrations, and when raw_sheet is absent', () => {
    expect(effectiveCropUrl(variant('fairy', { raw_sheet: { illustrations: [], crops: [crop(true, [])] } }))).toBeNull();
    expect(effectiveCropUrl(variant('stage-ish'))).toBeNull();
  });
});

describe('useSketchLineupEntries', () => {
  beforeEach(() => {
    setSketchEntities('characters', []);
    setSketchEntities('props', []);
  });

  it('projects EVERY variant incl. base, in snapshot order, with ref/imageUrl/heightCm', () => {
    const { result } = renderHook(() => useSketchLineupEntries('characters'));
    setSketchEntities('characters', [
      {
        key: 'elara',
        variants: [
          variant('base', {
            height: 110,
            raw_sheet: { illustrations: [], crops: [crop(true, [illustration('elara-base.png', true)])] },
          }),
          variant('fairy', {
            height: 95.5,
            raw_sheet: { illustrations: [], crops: [crop(true, [illustration('elara-fairy.png', true)])] },
          }),
        ],
      },
      { key: 'malakor', variants: [variant('base', { height: 200 })] }, // no crop → imageUrl null
    ]);

    expect(result.current).toEqual([
      {
        kind: 'characters',
        entityKey: 'elara',
        variantKey: 'base',
        ref: '@elara/base',
        imageUrl: 'elara-base.png',
        heightCm: 110,
      },
      {
        kind: 'characters',
        entityKey: 'elara',
        variantKey: 'fairy',
        ref: '@elara/fairy',
        imageUrl: 'elara-fairy.png',
        heightCm: 95.5, // number pass-through — no parsing/rounding in the selector
      },
      {
        kind: 'characters',
        entityKey: 'malakor',
        variantKey: 'base',
        ref: '@malakor/base',
        imageUrl: null,
        heightCm: 200,
      },
    ]);
  });

  it('maps an absent height to null (row → not selectable)', () => {
    const { result } = renderHook(() => useSketchLineupEntries('props'));
    setSketchEntities('props', [{ key: 'magic-wand', variants: [variant('base')] }]);
    expect(result.current[0]).toMatchObject({ ref: '@magic-wand/base', imageUrl: null, heightCm: null });
  });

  it('keeps a stable ref while the raw slice is unchanged (useMemo keyed on the raw ref)', () => {
    setSketchEntities('characters', [{ key: 'elara', variants: [variant('base', { height: 110 })] }]);
    const { result, rerender } = renderHook(() => useSketchLineupEntries('characters'));
    const first = result.current;
    rerender();
    // A fresh array each render would loop under useShallow — this is the regression guard.
    expect(result.current).toBe(first);
  });

  it('reads the two kinds independently', () => {
    setSketchEntities('characters', [{ key: 'elara', variants: [variant('base')] }]);
    setSketchEntities('props', [{ key: 'magic-wand', variants: [variant('base')] }]);
    const { result: chars } = renderHook(() => useSketchLineupEntries('characters'));
    const { result: props } = renderHook(() => useSketchLineupEntries('props'));
    expect(chars.current.map((e) => e.ref)).toEqual(['@elara/base']);
    expect(props.current.map((e) => e.ref)).toEqual(['@magic-wand/base']);
    expect(props.current[0].kind).toBe('props');
  });
});
