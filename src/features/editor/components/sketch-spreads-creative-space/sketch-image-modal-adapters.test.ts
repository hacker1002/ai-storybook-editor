// sketch-image-modal-adapters.test.ts — unit tests for the pure sketch↔shared-modal adapters.
// These guard the field mapping + the duplicate-version guard that keep Edit/Extract commits from
// appending stray page-image versions.

import { describe, it, expect } from 'vitest';
import {
  toIllustrations,
  classifyEditCommit,
  toSpreadImage,
} from './sketch-image-modal-adapters';
import type { SketchSpreadIllustration, SketchSpreadImage } from '@/types/sketch';

const illus = (media_url: string, is_selected: boolean): SketchSpreadIllustration => ({
  media_url,
  created_time: '2026-07-04T00:00:00.000Z',
  is_selected,
});

describe('toIllustrations', () => {
  it('maps media_url/created_time/is_selected field-for-field, preserving order', () => {
    const src = [illus('a.png', false), illus('b.png', true)];
    const out = toIllustrations(src);
    expect(out).toEqual([
      { media_url: 'a.png', created_time: '2026-07-04T00:00:00.000Z', is_selected: false },
      { media_url: 'b.png', created_time: '2026-07-04T00:00:00.000Z', is_selected: true },
    ]);
  });

  it('omits `type` (modal coerces absent → "created")', () => {
    const out = toIllustrations([illus('a.png', true)]);
    expect('type' in out[0]).toBe(false);
  });

  it('returns [] for []', () => {
    expect(toIllustrations([])).toEqual([]);
  });
});

describe('classifyEditCommit', () => {
  it('append: the is_selected illustration url is genuinely new', () => {
    const next = [
      { media_url: 'old.png', created_time: 't', is_selected: false },
      { media_url: 'new.png', created_time: 't', is_selected: true },
    ];
    expect(classifyEditCommit(next, ['old.png'])).toEqual({ kind: 'append', url: 'new.png' });
  });

  it('falls back to the first entry when none is selected', () => {
    const next = [
      { media_url: 'first.png', created_time: 't', is_selected: false },
      { media_url: 'second.png', created_time: 't', is_selected: false },
    ];
    expect(classifyEditCommit(next, [])).toEqual({ kind: 'append', url: 'first.png' });
  });

  it('noop on empty list', () => {
    expect(classifyEditCommit([], ['cur.png'])).toEqual({ kind: 'noop' });
  });

  it('select: the selected url equals the current head version (re-selection, not a dup append)', () => {
    const next = [{ media_url: 'same.png', created_time: 't', is_selected: true }];
    expect(classifyEditCommit(next, ['same.png'])).toEqual({ kind: 'select', url: 'same.png' });
  });

  it('select: re-selecting an OLDER existing variant flips selection instead of appending', () => {
    // Modal emits onUpdateIllustrations with v1 re-selected while v3 is the current head.
    const next = [{ media_url: 'v1.png', created_time: 't', is_selected: true }];
    expect(classifyEditCommit(next, ['v3.png', 'v2.png', 'v1.png'])).toEqual({
      kind: 'select',
      url: 'v1.png',
    });
  });

  it('append: the url is new to the version list', () => {
    const next = [{ media_url: 'fresh.png', created_time: 't', is_selected: true }];
    expect(classifyEditCommit(next, ['stale.png', 'older.png'])).toEqual({
      kind: 'append',
      url: 'fresh.png',
    });
  });
});

describe('toSpreadImage', () => {
  const sketchImg: SketchSpreadImage = {
    id: 'img-1',
    type: 'right',
    illustrations: [illus('v1.png', true)],
  };
  const geom = { x: 50, y: 0, w: 50, h: 100 };

  it('synthesizes id/geometry/media_url/illustrations for the crop tab', () => {
    const out = toSpreadImage(sketchImg, geom, 'v1.png');
    expect(out.id).toBe('img-1');
    expect(out.geometry).toEqual(geom);
    expect(out.media_url).toBe('v1.png');
    expect(out.illustrations).toEqual([
      { media_url: 'v1.png', created_time: '2026-07-04T00:00:00.000Z', is_selected: true },
    ]);
  });

  it('leaves media_url undefined when url is null', () => {
    const out = toSpreadImage(sketchImg, geom, null);
    expect(out.media_url).toBeUndefined();
  });
});
