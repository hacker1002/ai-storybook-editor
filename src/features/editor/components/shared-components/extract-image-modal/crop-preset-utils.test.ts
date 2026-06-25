// crop-preset-utils.test.ts — Unit tests for the books.crop_presets[] CRUD helpers.

import { describe, it, expect } from 'vitest';
import type { CropPreset } from '@/types/editor';
import { upsertCropPreset, deleteCropPreset } from './crop-preset-utils';

const p = (id: string, title: string, x = 0): CropPreset => ({
  id,
  title,
  geometry: { x, y: 0, w: 20, h: 20 },
});

describe('upsertCropPreset', () => {
  it('appends a preset with a new id', () => {
    const list = [p('a', 'A')];
    const next = upsertCropPreset(list, p('b', 'B'));
    expect(next.map((x) => x.id)).toEqual(['a', 'b']);
    expect(next).not.toBe(list); // new array (immutable)
  });

  it('replaces the preset with the same id (no duplicate)', () => {
    const list = [p('a', 'A', 5), p('b', 'B')];
    const next = upsertCropPreset(list, p('a', 'A renamed', 50));
    expect(next).toHaveLength(2);
    expect(next.find((x) => x.id === 'a')).toEqual({
      id: 'a',
      title: 'A renamed',
      geometry: { x: 50, y: 0, w: 20, h: 20 },
    });
  });
});

describe('deleteCropPreset', () => {
  it('filters out the preset by id', () => {
    const list = [p('a', 'A'), p('b', 'B')];
    expect(deleteCropPreset(list, 'a').map((x) => x.id)).toEqual(['b']);
  });

  it('returns an equivalent list when the id is absent (no-op)', () => {
    const list = [p('a', 'A')];
    const next = deleteCropPreset(list, 'zzz');
    expect(next.map((x) => x.id)).toEqual(['a']);
  });
});
