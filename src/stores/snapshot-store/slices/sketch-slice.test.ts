import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { normalizeSketch, DEFAULT_SKETCH, createSketchSlice } from './sketch-slice';
import type { Sketch, SketchEntity } from '@/types/sketch';

// Isolated harness: the sketch slice + the only cross-slice field its actions touch
// (sync.isDirty). Avoids pulling the full store (and supabase client) into a unit test.
/* eslint-disable @typescript-eslint/no-explicit-any */
function createTestStore() {
  return create<any>()(
    immer((...a: any[]) => ({
      ...(createSketchSlice as any)(...a),
      sync: { isDirty: false },
    }))
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const entity = (key: string, variants: SketchEntity['variants'] = []): SketchEntity => ({
  key,
  media_url: null,
  variants,
});

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

describe('SketchSlice entity actions', () => {
  let store: ReturnType<typeof createTestStore>;
  beforeEach(() => {
    store = createTestStore();
  });

  it('setSketchEntities replaces the kind array + sets isDirty', () => {
    store.getState().setSketchEntities('characters', [entity('kid'), entity('mom')]);
    expect(store.getState().sketch.characters.map((e: SketchEntity) => e.key)).toEqual(['kid', 'mom']);
    expect(store.getState().sketch.props).toEqual([]);
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('upsertSketchEntity adds when key is new', () => {
    store.getState().upsertSketchEntity('props', entity('wand'));
    expect(store.getState().sketch.props).toHaveLength(1);
    expect(store.getState().sketch.props[0].key).toBe('wand');
  });

  it('upsertSketchEntity replaces in place when key exists', () => {
    store.getState().setSketchEntities('props', [entity('wand'), entity('shield')]);
    store.getState().upsertSketchEntity('props', entity('wand', [{ key: 'base', visual_description: 'new' }]));
    expect(store.getState().sketch.props).toHaveLength(2);
    expect(store.getState().sketch.props[0].variants).toEqual([{ key: 'base', visual_description: 'new' }]);
  });

  it('removeSketchEntity filters out the key', () => {
    store.getState().setSketchEntities('stages', [entity('forest'), entity('castle')]);
    store.getState().removeSketchEntity('stages', 'forest');
    expect(store.getState().sketch.stages.map((e: SketchEntity) => e.key)).toEqual(['castle']);
  });

  it('setSketchEntityMediaUrl sets media_url on the matched entity only', () => {
    store.getState().setSketchEntities('characters', [entity('kid'), entity('mom')]);
    store.getState().setSketchEntityMediaUrl('characters', 'kid', 'https://x/img.png');
    expect(store.getState().sketch.characters[0].media_url).toBe('https://x/img.png');
    expect(store.getState().sketch.characters[1].media_url).toBeNull();
  });

  it('upsertSketchVariant adds then updates a variant in place', () => {
    store.getState().setSketchEntities('characters', [entity('kid')]);
    store.getState().upsertSketchVariant('characters', 'kid', { key: 'hero', visual_description: 'caped' });
    expect(store.getState().sketch.characters[0].variants).toEqual([{ key: 'hero', visual_description: 'caped' }]);
    store.getState().upsertSketchVariant('characters', 'kid', { key: 'hero', visual_description: 'masked' });
    expect(store.getState().sketch.characters[0].variants).toEqual([{ key: 'hero', visual_description: 'masked' }]);
  });

  it('upsertSketchVariant is a no-op when the entity is missing', () => {
    store.getState().setSketchEntities('characters', []);
    store.getState().upsertSketchVariant('characters', 'ghost', { key: 'base', visual_description: 'x' });
    expect(store.getState().sketch.characters).toEqual([]);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resetDirty = () => store.setState((s: any) => { s.sync.isDirty = false; });

  it('every successful entity mutation sets sync.isDirty', () => {
    store.getState().upsertSketchEntity('characters', entity('kid'));
    expect(store.getState().sync.isDirty).toBe(true);

    resetDirty();
    store.getState().setSketchEntityMediaUrl('characters', 'kid', 'u');
    expect(store.getState().sync.isDirty).toBe(true);

    resetDirty();
    store.getState().upsertSketchVariant('characters', 'kid', { key: 'base', visual_description: 'x' });
    expect(store.getState().sync.isDirty).toBe(true);

    resetDirty();
    store.getState().removeSketchEntity('characters', 'kid');
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('find-guarded no-ops leave sync.isDirty false', () => {
    store.getState().setSketchEntities('characters', []); // sets dirty
    resetDirty();
    store.getState().setSketchEntityMediaUrl('characters', 'ghost', 'u'); // no match
    store.getState().upsertSketchVariant('characters', 'ghost', { key: 'base', visual_description: 'x' });
    expect(store.getState().sync.isDirty).toBe(false);
  });
});
