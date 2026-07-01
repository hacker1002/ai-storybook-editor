import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { normalizeSketch, DEFAULT_SKETCH, createSketchSlice } from './sketch-slice';
import type { Sketch, SketchEntity, SketchSpread, ArtDirection, SketchTextbox } from '@/types/sketch';
import type { Geometry, Typography } from '@/types/spread-types';

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

describe('SketchSlice spread actions', () => {
  let store: ReturnType<typeof createTestStore>;
  beforeEach(() => {
    store = createTestStore();
  });

  const geo: Geometry = { x: 0, y: 0, w: 100, h: 100 };
  const typo: Typography = { size: 16 };
  const emptyAd = (): ArtDirection => ({
    stage: '', setting: '', light_color: '', composition: '', action: '', camera: '',
    art_concept: '', negative_space: '', layers: '', interactive_intent: '', animation: '',
    sound: '', space_time: '',
  });
  const spread = (id: string, pageTypes: SketchSpread['pages'][number]['type'][] = ['left', 'right']): SketchSpread => ({
    id,
    media_url: null,
    pages: pageTypes.map((type) => ({ type, art_direction: emptyAd() })),
    textboxes: [],
  });
  const seed = (...spreads: SketchSpread[]) => store.getState().setSketchSpreads(spreads);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resetDirty = () => store.setState((s: any) => { s.sync.isDirty = false; });
  const ids = () => store.getState().sketch.spreads.map((s: SketchSpread) => s.id);

  it('setSketchSpreads replaces the array + sets isDirty', () => {
    seed(spread('a'), spread('b'));
    expect(ids()).toEqual(['a', 'b']);
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('addSketchSpread pushes to the end', () => {
    seed(spread('a'));
    store.getState().addSketchSpread(spread('b'));
    expect(ids()).toEqual(['a', 'b']);
  });

  it('deleteSketchSpread filters out the id', () => {
    seed(spread('a'), spread('b'), spread('c'));
    store.getState().deleteSketchSpread('b');
    expect(ids()).toEqual(['a', 'c']);
  });

  it('reorderSketchSpreads moves from→to (down and up)', () => {
    seed(spread('a'), spread('b'), spread('c'), spread('d'));
    store.getState().reorderSketchSpreads(0, 2); // a down
    expect(ids()).toEqual(['b', 'c', 'a', 'd']);
    store.getState().reorderSketchSpreads(3, 0); // d up
    expect(ids()).toEqual(['d', 'b', 'c', 'a']);
  });

  it('reorderSketchSpreads clamps out-of-range indices', () => {
    seed(spread('a'), spread('b'), spread('c'));
    store.getState().reorderSketchSpreads(0, 99); // clamp to last
    expect(ids()).toEqual(['b', 'c', 'a']);
  });

  it('reorderSketchSpreads is a no-op when from==to (isDirty stays false)', () => {
    seed(spread('a'), spread('b'));
    resetDirty();
    store.getState().reorderSketchSpreads(1, 1);
    expect(ids()).toEqual(['a', 'b']);
    expect(store.getState().sync.isDirty).toBe(false);
  });

  it('setSketchSpreadMediaUrl sets the matched spread only', () => {
    seed(spread('a'), spread('b'));
    store.getState().setSketchSpreadMediaUrl('a', 'https://x/s.png');
    expect(store.getState().sketch.spreads[0].media_url).toBe('https://x/s.png');
    expect(store.getState().sketch.spreads[1].media_url).toBeNull();
  });

  it('updateSketchPageArtDirection merges patch into the page matched by type', () => {
    seed(spread('a', ['left', 'right']));
    store.getState().updateSketchPageArtDirection('a', 'right', { stage: 'forest', camera: 'wide' });
    const pages = store.getState().sketch.spreads[0].pages;
    expect(pages.find((p: SketchSpread['pages'][number]) => p.type === 'right')!.art_direction.stage).toBe('forest');
    expect(pages.find((p: SketchSpread['pages'][number]) => p.type === 'right')!.art_direction.camera).toBe('wide');
    // left page untouched
    expect(pages.find((p: SketchSpread['pages'][number]) => p.type === 'left')!.art_direction.stage).toBe('');
  });

  it('updateSketchPageArtDirection no-ops on a missing page type (isDirty stays false)', () => {
    seed(spread('a', ['full']));
    resetDirty();
    store.getState().updateSketchPageArtDirection('a', 'left', { stage: 'x' });
    expect(store.getState().sync.isDirty).toBe(false);
  });

  it('updateSketchTextbox merges into the language entry, skipping the id slot', () => {
    const tb: SketchTextbox = { id: 't1', en: { text: 'hi', geometry: geo, typography: typo } };
    seed({ id: 'a', media_url: null, pages: [], textboxes: [tb] });
    store.getState().updateSketchTextbox('a', 't1', 'en', { text: 'hello' });
    const entry = store.getState().sketch.spreads[0].textboxes[0].en;
    expect(entry.text).toBe('hello');
    expect(entry.geometry).toEqual(geo); // untouched
    expect(store.getState().sketch.spreads[0].textboxes[0].id).toBe('t1');
  });

  it('updateSketchTextbox creates the language entry when absent (canvas create-on-first-edit)', () => {
    const tb: SketchTextbox = { id: 't1', en: { text: 'hi', geometry: geo, typography: typo } };
    seed({ id: 'a', media_url: null, pages: [], textboxes: [tb] });
    resetDirty();
    // Canvas emits a full content object for the newly-requested language.
    store.getState().updateSketchTextbox('a', 't1', 'vi', { text: 'xin chào', geometry: geo, typography: typo });
    const created = store.getState().sketch.spreads[0].textboxes[0].vi;
    expect(created.text).toBe('xin chào');
    expect(store.getState().sketch.spreads[0].textboxes[0].en.text).toBe('hi'); // other lang untouched
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('updateSketchTextbox never overwrites the id slot', () => {
    const tb: SketchTextbox = { id: 't1', en: { text: 'hi', geometry: geo, typography: typo } };
    seed({ id: 'a', media_url: null, pages: [], textboxes: [tb] });
    resetDirty();
    store.getState().updateSketchTextbox('a', 't1', 'id', { text: 'nope' });
    expect(store.getState().sketch.spreads[0].textboxes[0].id).toBe('t1');
    expect(store.getState().sync.isDirty).toBe(false);
  });

  it('deleteSketchTextbox removes the textbox by id', () => {
    const tb = (id: string): SketchTextbox => ({ id, en: { text: id, geometry: geo, typography: typo } });
    seed({ id: 'a', media_url: null, pages: [], textboxes: [tb('t1'), tb('t2')] });
    store.getState().deleteSketchTextbox('a', 't1');
    expect(store.getState().sketch.spreads[0].textboxes.map((t: SketchTextbox) => t.id)).toEqual(['t2']);
  });

  it('mutations set isDirty; missing-target actions do not', () => {
    seed(spread('a'));
    resetDirty();
    store.getState().setSketchSpreadMediaUrl('missing', 'u');
    store.getState().deleteSketchTextbox('missing', 't');
    store.getState().updateSketchTextbox('missing', 't', 'en', { text: 'x' });
    expect(store.getState().sync.isDirty).toBe(false);
  });
});
