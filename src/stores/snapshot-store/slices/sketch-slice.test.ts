import { describe, it, expect } from 'vitest';
import { normalizeSketch, DEFAULT_SKETCH } from './sketch-slice';
import type { Sketch } from '@/types/sketch';

describe('normalizeSketch', () => {
  it('returns DEFAULT_SKETCH for undefined / null / non-object', () => {
    expect(normalizeSketch(undefined)).toEqual(DEFAULT_SKETCH);
    expect(normalizeSketch(null)).toEqual(DEFAULT_SKETCH);
    expect(normalizeSketch('nope')).toEqual(DEFAULT_SKETCH);
    expect(normalizeSketch(42)).toEqual(DEFAULT_SKETCH);
    expect(normalizeSketch([])).toEqual(DEFAULT_SKETCH);
  });

  it('resets legacy shape (top-level markers) to empty', () => {
    expect(normalizeSketch({ dummy_id: 'd1', spreads: [] })).toEqual(DEFAULT_SKETCH);
    expect(normalizeSketch({ character_sheets: [{}] })).toEqual(DEFAULT_SKETCH);
    expect(normalizeSketch({ prop_sheets: [{}] })).toEqual(DEFAULT_SKETCH);
  });

  it('resets legacy spread shape (spreads[].images[]) to empty', () => {
    const legacy = { id: 'x', spreads: [{ id: 's1', images: [{ id: 'i1' }] }] };
    expect(normalizeSketch(legacy)).toEqual(DEFAULT_SKETCH);
  });

  it('preserves a valid new-shape sketch', () => {
    const valid: Sketch = {
      id: 'sk1',
      characters: [{ key: 'c1', media_url: null, variants: [] }],
      props: [],
      stages: [{ key: 'st1', media_url: 'u', variants: [{ key: 'v', visual_description: 'd' }] }],
      spreads: [{ id: 'sp1', media_url: null, pages: [], textboxes: [] }],
    };
    expect(normalizeSketch(valid)).toEqual(valid);
  });

  it('defaults missing nested arrays to [] (defensive)', () => {
    expect(normalizeSketch({ id: 'only-id' })).toEqual({
      id: 'only-id',
      characters: [],
      props: [],
      stages: [],
      spreads: [],
    });
  });

  it('coerces a non-string id to null', () => {
    const result = normalizeSketch({ id: 123, characters: [], props: [], stages: [], spreads: [] });
    expect(result.id).toBeNull();
  });
});
