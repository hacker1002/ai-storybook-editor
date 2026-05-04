import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  audioTags,
  distinctTags,
  durationBoundsOf,
  normalizeTags,
} from '../audio-filters';
import type { AudioFilterState, AudioResource } from '../../types';

const baseFilter: AudioFilterState = {
  search: '',
  source: null,
  type: null,
  tags: [],
  durationRange: null,
};

function make(overrides: Partial<AudioResource> = {}): AudioResource {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    name: 'Sample',
    description: null,
    mediaUrl: 'https://x/a.mp3',
    loop: false,
    duration: 5000,
    influence: null,
    tags: null,
    source: 0,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

describe('audio-filters', () => {
  it('applyFilters: empty list returns empty', () => {
    expect(applyFilters([], baseFilter)).toEqual([]);
  });

  it('applyFilters: search matches name/desc/tags case-insensitive', () => {
    const a = make({ name: 'Forest Wind' });
    const b = make({ name: 'Bell', description: 'Forest church' });
    const c = make({ name: 'Drum', tags: 'forest,loop' });
    const d = make({ name: 'Other' });
    const result = applyFilters([a, b, c, d], { ...baseFilter, search: 'forest' });
    expect(result.map((x) => x.name).sort()).toEqual(['Bell', 'Drum', 'Forest Wind']);
  });

  it('applyFilters: source filter', () => {
    const a = make({ source: 0 });
    const b = make({ source: 1 });
    expect(applyFilters([a, b], { ...baseFilter, source: 1 })).toEqual([b]);
  });

  it('applyFilters: type loop / one_shot', () => {
    const loop = make({ loop: true });
    const oneShot = make({ loop: false });
    expect(applyFilters([loop, oneShot], { ...baseFilter, type: 'loop' })).toEqual([loop]);
    expect(applyFilters([loop, oneShot], { ...baseFilter, type: 'one_shot' })).toEqual([oneShot]);
  });

  it('applyFilters: tags AND match', () => {
    const a = make({ tags: 'ambient,nature' });
    const b = make({ tags: 'ambient,loop' });
    const c = make({ tags: 'drum' });
    const result = applyFilters([a, b, c], {
      ...baseFilter,
      tags: ['ambient', 'nature'],
    });
    expect(result).toEqual([a]);
  });

  it('applyFilters: durationRange inclusive bounds', () => {
    const a = make({ duration: 1000 });
    const b = make({ duration: 5000 });
    const c = make({ duration: 10000 });
    const result = applyFilters([a, b, c], {
      ...baseFilter,
      durationRange: [2000, 8000],
    });
    expect(result).toEqual([b]);
  });

  it('distinctTags: dedupes + sorts', () => {
    const a = make({ tags: 'b,a,c' });
    const b = make({ tags: 'a,d' });
    expect(distinctTags([a, b])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('distinctTags: empty list', () => {
    expect(distinctTags([])).toEqual([]);
  });

  it('durationBoundsOf: empty list returns [0,0]', () => {
    expect(durationBoundsOf([])).toEqual([0, 0]);
  });

  it('durationBoundsOf: min/max', () => {
    const items = [make({ duration: 5000 }), make({ duration: 1000 }), make({ duration: 9000 })];
    expect(durationBoundsOf(items)).toEqual([1000, 9000]);
  });

  it('normalizeTags: trim, lowercase, dedupe, cap at 10', () => {
    const out = normalizeTags(' Foo, BAR, foo,baz ,, qux');
    expect(out).toBe('foo,bar,baz,qux');
    const long = Array.from({ length: 15 }, (_, i) => `t${i}`).join(',');
    const capped = normalizeTags(long).split(',');
    expect(capped.length).toBe(10);
  });

  it('audioTags: empty returns []', () => {
    expect(audioTags(make({ tags: null }))).toEqual([]);
  });
});
