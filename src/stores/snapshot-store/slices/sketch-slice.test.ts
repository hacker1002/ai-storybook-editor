import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { normalizeSketch, normalizeSketchSpread, DEFAULT_SKETCH, createSketchSlice } from './sketch-slice';
import { getSketchSpreadEffectiveUrl } from '@/types/sketch';
import type { Sketch, SketchEntity, SketchVariant, SketchVariantCrop, SketchSpread, ArtDirection, SketchTextbox } from '@/types/sketch';
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

// New-shape variant: 3 required text fields (height/imagery optional). `visual_design` carries
// the description text in the thin single-column import (2026-07-13 restructure).
const variant = (key: string, visualDesign = ''): SketchVariant => ({
  key,
  description: '',
  visual_design: visualDesign,
  art_language: '',
});

const entity = (key: string, variants: SketchEntity['variants'] = []): SketchEntity => ({
  key,
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

  // CONTRACT CHANGE (2026-07-17, data-loss fix): legacy markers used to hard-reset the WHOLE
  // sketch to DEFAULT_SKETCH. They no longer reset anything — the blob is mapped defensively and
  // the stale markers are reported as an anomaly instead. See the "data-safety" describe below.
  it('maps a legacy-marker blob defensively instead of resetting to empty', () => {
    expect(normalizeSketch({ dummy_id: 'd1', spreads: [] })).toEqual(DEFAULT_SKETCH);
    // ...but a marker blob that CARRIES data keeps it (that is the whole point):
    const withData = { character_sheets: [{}], characters: [{ key: 'kid', variants: [] }] };
    expect(normalizeSketch(withData).characters).toEqual([{ key: 'kid', variants: [] }]);
  });

  it('maps a legacy spread (images[], no pages[]) instead of resetting to empty', () => {
    const legacy = { id: 'x', spreads: [{ id: 's1', images: [{ id: 'i1' }] }] };
    const result = normalizeSketch(legacy);
    expect(result.id).toBe('x');
    expect(result.spreads).toHaveLength(1);
    expect(result.spreads[0].id).toBe('s1');
  });

  it('preserves a valid new-shape sketch', () => {
    const valid: Sketch = {
      id: 'sk1',
      base: { character_sheet: { styles: [] }, prop_sheet: { styles: [] } },
      characters: [{ key: 'c1', variants: [] }],
      props: [],
      stages: [{ key: 'st1', variants: [{ key: 'v', description: '', visual_design: 'd', art_language: '' }] }],
      spreads: [{ id: 'sp1', images: [], pages: [], textboxes: [] }],
    };
    expect(normalizeSketch(valid)).toEqual(valid);
  });

  it('defaults a missing base workspace to two empty sheets (backward-compat)', () => {
    const result = normalizeSketch({ id: 'no-base', characters: [], props: [], stages: [], spreads: [] });
    expect(result.base).toEqual({ character_sheet: { styles: [] }, prop_sheet: { styles: [] } });
  });

  it('defaults missing nested arrays to [] (defensive)', () => {
    expect(normalizeSketch({ id: 'only-id' })).toEqual({
      id: 'only-id',
      base: { character_sheet: { styles: [] }, prop_sheet: { styles: [] } },
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

  // Discriminator HAZARD (phase-01): the versioned model ADDS images[] to the new spread shape,
  // which also carries pages[]. A new spread (images + pages) must NOT false-positive as legacy.
  it('does NOT reset a new-shape spread that has BOTH images[] and pages[]', () => {
    const raw = {
      id: 'sk',
      characters: [],
      props: [],
      stages: [],
      spreads: [
        { id: 'sp', images: [{ id: 'i', illustrations: [] }], pages: [{ type: 'full' }], textboxes: [] },
      ],
    };
    const result = normalizeSketch(raw);
    expect(result.spreads).toHaveLength(1);
    expect(result.spreads[0].id).toBe('sp');
  });
});

// REGRESSION NET for the 2026-07-17 silent-data-loss incident: `normalizeSketch` judged the whole
// blob from `spreads[0]` (isLegacySketchShape) and returned DEFAULT_SKETCH on a false positive,
// wiping base.character_sheet.styles / characters / props IN MEMORY. The user then edited, the
// held-session release-save wrote the whole node back, and the empty was PERSISTED.
// Core rule under test: an unexpected shape NEVER blanks populated data — it is reported instead.
describe('normalizeSketch data-safety (never silently blank populated data)', () => {
  const style = (prompt: string) => ({
    style_prompt: prompt,
    is_selected: true,
    image_references: [],
    illustrations: [],
    crops: [],
  });

  // A blob that is populated everywhere AND trips the old `spreads[0]` legacy discriminator
  // (`images` present, `pages` absent).
  const populatedLegacySpreadBlob = () => ({
    id: 'sk1',
    base: {
      character_sheet: { styles: [style('watercolor')] },
      prop_sheet: { styles: [style('inked')] },
    },
    characters: [{ key: 'kid', variants: [] }],
    props: [{ key: 'wand', variants: [] }],
    stages: [{ key: 'forest', variants: [] }],
    spreads: [{ id: 's1', images: [{ id: 'i1', illustrations: [] }] }],
  });

  const collect = (raw: unknown) => {
    const anomalies: string[] = [];
    const sketch = normalizeSketch(raw, (a) => anomalies.push(a));
    return { sketch, anomalies };
  };

  it('does NOT wipe base styles / characters / props when spreads[0] has images and no pages', () => {
    const result = normalizeSketch(populatedLegacySpreadBlob());
    expect(result.base.character_sheet.styles).toHaveLength(1);
    expect(result.base.character_sheet.styles[0].style_prompt).toBe('watercolor');
    expect(result.base.prop_sheet.styles).toHaveLength(1);
    expect(result.characters).toEqual([{ key: 'kid', variants: [] }]);
    expect(result.props).toEqual([{ key: 'wand', variants: [] }]);
    expect(result.stages).toEqual([{ key: 'forest', variants: [] }]);
    // The spread itself survives too (pages defaults to [], images kept).
    expect(result.spreads).toHaveLength(1);
    expect(result.spreads[0].id).toBe('s1');
  });

  it.each(['dummy_id', 'character_sheets', 'prop_sheets'])(
    'does NOT wipe populated base styles when the legacy marker %s is present',
    (marker) => {
      const raw = {
        [marker]: 'legacy-value',
        base: { character_sheet: { styles: [style('watercolor')] }, prop_sheet: { styles: [] } },
        characters: [{ key: 'kid', variants: [] }],
      };
      const { sketch, anomalies } = collect(raw);
      expect(sketch.base.character_sheet.styles).toHaveLength(1);
      expect(sketch.base.character_sheet.styles[0].style_prompt).toBe('watercolor');
      expect(sketch.characters).toEqual([{ key: 'kid', variants: [] }]);
      // Stale top-level keys are not part of the Sketch type → dropped on the next whole-node
      // save, so the user must be told rather than have it happen silently.
      expect(anomalies.join(' ')).toContain(marker);
    },
  );

  it('does NOT blank a populated styles[] when the sheet carries odd sibling keys', () => {
    const raw = {
      base: {
        character_sheet: { styles: [style('watercolor')], legacy_junk: 42 },
        prop_sheet: { styles: [] },
      },
    };
    const { sketch, anomalies } = collect(raw);
    expect(sketch.base.character_sheet.styles).toHaveLength(1);
    expect(anomalies).toEqual([]); // styles is a valid array → nothing to cry wolf about
  });

  it('salvages a populated styles[] stored directly in the sheet slot (array, not object)', () => {
    const raw = { base: { character_sheet: [style('watercolor')], prop_sheet: { styles: [] } } };
    const { sketch, anomalies } = collect(raw);
    expect(sketch.base.character_sheet.styles).toHaveLength(1);
    expect(sketch.base.character_sheet.styles[0].style_prompt).toBe('watercolor');
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toContain('base.character_sheet');
  });

  // A salvaged element must not become a crash: the base-workspace actions dereference
  // styles[i].crops / .illustrations without full optional chaining, so a recovered element that
  // isn't shaped like a style would throw on interaction. Salvage must coerce, not just cast.
  it('element-coerces salvaged styles so a junk element cannot crash the base workspace', () => {
    const { sketch } = collect({ base: { character_sheet: ['watercolor', { style_prompt: 'ok' }] } });
    const styles = sketch.base.character_sheet.styles;
    expect(styles).toHaveLength(2);
    for (const s of styles) {
      // The exact shapes the store actions reach into.
      expect(Array.isArray(s.crops)).toBe(true);
      expect(Array.isArray(s.illustrations)).toBe(true);
      expect(Array.isArray(s.image_references)).toBe(true);
    }
    expect(styles[1].style_prompt).toBe('ok'); // real style survives salvage intact
  });

  // Positional jsonb_set writes through the collab gateway can leave an object-map where an array
  // is expected — the shape most likely to produce the reported `styles: []` symptom.
  it('salvages an object-map styles ({"0":…,"1":…}) instead of blanking it', () => {
    const raw = {
      base: {
        character_sheet: { styles: { 0: style('watercolor'), 1: style('inked') } },
        prop_sheet: { styles: [] },
      },
    };
    const { sketch, anomalies } = collect(raw);
    expect(sketch.base.character_sheet.styles).toHaveLength(2);
    expect(sketch.base.character_sheet.styles.map((s) => s.style_prompt)).toEqual([
      'watercolor',
      'inked',
    ]);
    expect(anomalies).toHaveLength(1);
  });

  it('reports (does not swallow) a malformed sheet and a malformed styles field', () => {
    expect(collect({ base: { character_sheet: 'nope', prop_sheet: { styles: [] } } }).anomalies)
      .toHaveLength(1);
    expect(collect({ base: { character_sheet: { styles: { a: 1 } }, prop_sheet: { styles: [] } } }).anomalies)
      .toHaveLength(1);
    expect(collect({ base: 'nope' }).anomalies).toHaveLength(1);
  });

  it('does NOT blank populated entity collections that are malformed — reports instead', () => {
    const { sketch, anomalies } = collect({ characters: 'nope', props: [{ key: 'wand', variants: [] }] });
    expect(sketch.props).toEqual([{ key: 'wand', variants: [] }]); // sibling untouched
    expect(anomalies.join(' ')).toContain('characters');
  });

  it('reports a non-object sketch blob but still yields DEFAULT_SKETCH', () => {
    expect(collect('nope').anomalies).toHaveLength(1);
    expect(collect(42).anomalies).toHaveLength(1);
    expect(collect('nope').sketch).toEqual(DEFAULT_SKETCH);
  });

  // MUST NOT CRY WOLF: a brand-new book genuinely has no sketch — that is not an anomaly, and a
  // toast there would train users to ignore the real one.
  it('reports NO anomaly for a genuinely absent sketch (null / undefined = new book)', () => {
    expect(collect(null)).toEqual({ sketch: DEFAULT_SKETCH, anomalies: [] });
    expect(collect(undefined)).toEqual({ sketch: DEFAULT_SKETCH, anomalies: [] });
  });

  it('reports NO anomaly for a well-formed sketch, nor for legitimately absent sub-trees', () => {
    expect(collect(populatedLegacySpreadBlob()).anomalies).toEqual([]);
    expect(collect({ id: 'only-id' }).anomalies).toEqual([]); // absent base/characters/spreads
    expect(collect({ base: {} }).anomalies).toEqual([]); // sheet slots absent → new, not broken
    expect(collect({ base: { character_sheet: {} } }).anomalies).toEqual([]); // no styles yet
  });

  it('reports a non-object spreads[] element rather than silently collapsing it', () => {
    const { sketch, anomalies } = collect({ spreads: [{ id: 'ok', pages: [], textboxes: [] }, null] });
    expect(sketch.spreads).toHaveLength(2); // slot kept (positional)
    expect(sketch.spreads[0].id).toBe('ok');
    expect(anomalies).toHaveLength(1);
  });
});

describe('normalizeSketchSpread (per-page versioned images[] back-compat)', () => {
  it('wraps a legacy scalar media_url into one selected illustration (type inferred from pages)', () => {
    const out = normalizeSketchSpread({ id: 's1', media_url: 'http://x/i.png', pages: [{ type: 'full' }], textboxes: [] });
    expect(out.images).toHaveLength(1);
    expect(out.images[0].type).toBe('full');
    expect(out.images[0].illustrations[0]).toMatchObject({ media_url: 'http://x/i.png', is_selected: true });
  });

  it('assigns per-page types to legacy typeless images from page order (no clamp)', () => {
    const images = [
      { id: 'i1', illustrations: [{ media_url: 'u1', created_time: 't', is_selected: true }] },
      { id: 'i2', illustrations: [{ media_url: 'u2', created_time: 't', is_selected: true }] },
    ];
    const out = normalizeSketchSpread({ id: 's1', images, pages: [{ type: 'left' }, { type: 'right' }], textboxes: [] });
    expect(out.images).toHaveLength(2);
    expect(out.images.map((im) => im.type)).toEqual(['left', 'right']);
    expect(out.images[0].id).toBe('i1');
  });

  it('dedupes images by page type (keeps first)', () => {
    const images = [
      { id: 'i1', type: 'full', illustrations: [] },
      { id: 'i2', type: 'full', illustrations: [] },
    ];
    const out = normalizeSketchSpread({ id: 's1', images, pages: [{ type: 'full' }], textboxes: [] });
    expect(out.images).toHaveLength(1);
    expect(out.images[0].id).toBe('i1');
  });

  it('defaults to images:[] when the spread has no image', () => {
    const out = normalizeSketchSpread({ id: 's1', pages: [], textboxes: [] });
    expect(out.images).toEqual([]);
  });

  it('collapses a non-object row to an empty spread', () => {
    expect(normalizeSketchSpread(null)).toEqual({ id: '', images: [], pages: [], textboxes: [] });
  });
});

describe('getSketchSpreadEffectiveUrl', () => {
  const withIllustrations = (
    ill: { media_url: string; created_time: string; is_selected: boolean }[],
  ): SketchSpread => ({ id: 's', images: ill.length ? [{ id: 'i', type: 'full', illustrations: ill }] : [], pages: [], textboxes: [] });

  it('returns the selected version url', () => {
    const s = withIllustrations([
      { media_url: 'new', created_time: 't', is_selected: false },
      { media_url: 'sel', created_time: 't', is_selected: true },
    ]);
    expect(getSketchSpreadEffectiveUrl(s)).toBe('sel');
  });

  it('falls back to the newest (index 0) when none selected', () => {
    const s = withIllustrations([{ media_url: 'first', created_time: 't', is_selected: false }]);
    expect(getSketchSpreadEffectiveUrl(s)).toBe('first');
  });

  it('returns null when the spread has no image', () => {
    expect(getSketchSpreadEffectiveUrl(withIllustrations([]))).toBeNull();
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
    store.getState().upsertSketchEntity('props', entity('wand', [variant('base', 'new')]));
    expect(store.getState().sketch.props).toHaveLength(2);
    expect(store.getState().sketch.props[0].variants).toEqual([variant('base', 'new')]);
  });

  it('removeSketchEntity filters out the key', () => {
    store.getState().setSketchEntities('stages', [entity('forest'), entity('castle')]);
    store.getState().removeSketchEntity('stages', 'forest');
    expect(store.getState().sketch.stages.map((e: SketchEntity) => e.key)).toEqual(['castle']);
  });

  it('upsertSketchVariant adds then updates a variant in place', () => {
    store.getState().setSketchEntities('characters', [entity('kid')]);
    store.getState().upsertSketchVariant('characters', 'kid', variant('hero', 'caped'));
    expect(store.getState().sketch.characters[0].variants).toEqual([variant('hero', 'caped')]);
    store.getState().upsertSketchVariant('characters', 'kid', variant('hero', 'masked'));
    expect(store.getState().sketch.characters[0].variants).toEqual([variant('hero', 'masked')]);
  });

  it('upsertSketchVariant is a no-op when the entity is missing', () => {
    store.getState().setSketchEntities('characters', []);
    store.getState().upsertSketchVariant('characters', 'ghost', variant('base', 'x'));
    expect(store.getState().sketch.characters).toEqual([]);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resetDirty = () => store.setState((s: any) => { s.sync.isDirty = false; });

  it('every successful entity mutation sets sync.isDirty', () => {
    store.getState().upsertSketchEntity('characters', entity('kid'));
    expect(store.getState().sync.isDirty).toBe(true);

    resetDirty();
    store.getState().upsertSketchVariant('characters', 'kid', variant('base', 'x'));
    expect(store.getState().sync.isDirty).toBe(true);

    resetDirty();
    store.getState().removeSketchEntity('characters', 'kid');
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('find-guarded no-ops leave sync.isDirty false', () => {
    store.getState().setSketchEntities('characters', []); // sets dirty
    resetDirty();
    store.getState().upsertSketchVariant('characters', 'ghost', variant('base', 'x')); // no match
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
    images: [],
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

  it('addSketchSpreadImageVersion prepends + auto-selects on the matched spread + page only', () => {
    seed(spread('a'), spread('b'));
    store.getState().addSketchSpreadImageVersion('a', 'left', 'https://x/s1.png');
    const imgs = store.getState().sketch.spreads[0].images;
    expect(imgs).toHaveLength(1);
    expect(imgs[0].type).toBe('left');
    expect(imgs[0].illustrations[0]).toMatchObject({ media_url: 'https://x/s1.png', is_selected: true });
    // Second generate on the SAME page: new version prepended + selected, previous deselected.
    store.getState().addSketchSpreadImageVersion('a', 'left', 'https://x/s2.png');
    const ill = store.getState().sketch.spreads[0].images[0].illustrations;
    expect(ill.map((i: { media_url: string }) => i.media_url)).toEqual(['https://x/s2.png', 'https://x/s1.png']);
    expect(ill[0].is_selected).toBe(true);
    expect(ill[1].is_selected).toBe(false);
    // Sibling spread untouched.
    expect(store.getState().sketch.spreads[1].images).toEqual([]);
  });

  it('selectSketchSpreadImageVersion flips is_selected to an existing version without prepending', () => {
    seed(spread('a'));
    store.getState().addSketchSpreadImageVersion('a', 'left', 'https://x/v1.png');
    store.getState().addSketchSpreadImageVersion('a', 'left', 'https://x/v2.png'); // v2 is head/selected
    resetDirty();
    store.getState().selectSketchSpreadImageVersion('a', 'left', 'https://x/v1.png');
    const ill = store.getState().sketch.spreads[0].images[0].illustrations;
    // Order unchanged (no prepend); selection moved to v1.
    expect(ill.map((i: { media_url: string }) => i.media_url)).toEqual(['https://x/v2.png', 'https://x/v1.png']);
    expect(ill.find((i: { media_url: string }) => i.media_url === 'https://x/v1.png').is_selected).toBe(true);
    expect(ill.find((i: { media_url: string }) => i.media_url === 'https://x/v2.png').is_selected).toBe(false);
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('selectSketchSpreadImageVersion no-ops (isDirty stays false) on unknown url or already-selected', () => {
    seed(spread('a'));
    store.getState().addSketchSpreadImageVersion('a', 'left', 'https://x/v1.png');
    resetDirty();
    store.getState().selectSketchSpreadImageVersion('a', 'left', 'https://x/missing.png'); // unknown url
    store.getState().selectSketchSpreadImageVersion('a', 'left', 'https://x/v1.png'); // already selected
    expect(store.getState().sync.isDirty).toBe(false);
    expect(store.getState().sketch.spreads[0].images[0].illustrations[0].is_selected).toBe(true);
  });

  it('addSketchSpreadImageVersion creates a separate image slot per page type', () => {
    seed(spread('a', ['left', 'right']));
    store.getState().addSketchSpreadImageVersion('a', 'left', 'https://x/left.png');
    store.getState().addSketchSpreadImageVersion('a', 'right', 'https://x/right.png');
    const imgs = store.getState().sketch.spreads[0].images;
    expect(imgs).toHaveLength(2);
    expect(imgs.map((im: { type: string }) => im.type).sort()).toEqual(['left', 'right']);
    const left = imgs.find((im: { type: string }) => im.type === 'left');
    const right = imgs.find((im: { type: string }) => im.type === 'right');
    expect(left.illustrations[0].media_url).toBe('https://x/left.png');
    expect(right.illustrations[0].media_url).toBe('https://x/right.png');
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
    seed({ id: 'a', images: [], pages: [], textboxes: [tb] });
    store.getState().updateSketchTextbox('a', 't1', 'en', { text: 'hello' });
    const entry = store.getState().sketch.spreads[0].textboxes[0].en;
    expect(entry.text).toBe('hello');
    expect(entry.geometry).toEqual(geo); // untouched
    expect(store.getState().sketch.spreads[0].textboxes[0].id).toBe('t1');
  });

  it('updateSketchTextbox creates the language entry when absent (canvas create-on-first-edit)', () => {
    const tb: SketchTextbox = { id: 't1', en: { text: 'hi', geometry: geo, typography: typo } };
    seed({ id: 'a', images: [], pages: [], textboxes: [tb] });
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
    seed({ id: 'a', images: [], pages: [], textboxes: [tb] });
    resetDirty();
    store.getState().updateSketchTextbox('a', 't1', 'id', { text: 'nope' });
    expect(store.getState().sketch.spreads[0].textboxes[0].id).toBe('t1');
    expect(store.getState().sync.isDirty).toBe(false);
  });

  it('deleteSketchTextbox removes the textbox by id', () => {
    const tb = (id: string): SketchTextbox => ({ id, en: { text: id, geometry: geo, typography: typo } });
    seed({ id: 'a', images: [], pages: [], textboxes: [tb('t1'), tb('t2')] });
    store.getState().deleteSketchTextbox('a', 't1');
    expect(store.getState().sketch.spreads[0].textboxes.map((t: SketchTextbox) => t.id)).toEqual(['t2']);
  });

  it('mutations set isDirty; missing-target actions do not', () => {
    seed(spread('a'));
    resetDirty();
    store.getState().addSketchSpreadImageVersion('missing', 'full', 'u');
    store.getState().deleteSketchTextbox('missing', 't');
    store.getState().updateSketchTextbox('missing', 't', 'en', { text: 'x' });
    expect(store.getState().sync.isDirty).toBe(false);
  });
});

describe('SketchSlice base (workspace) actions', () => {
  let store: ReturnType<typeof createTestStore>;
  beforeEach(() => {
    store = createTestStore();
  });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const resetDirty = () => store.setState((s: any) => { s.sync.isDirty = false; });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  it('addSketchBaseStyle appends style to sheet + sets isDirty', () => {
    const style = {
      style_prompt: 'test style',
      is_selected: false,
      image_references: [],
      illustrations: [],
      crops: [],
    };
    store.getState().addSketchBaseStyle('characters', style);
    expect(store.getState().sketch.base.character_sheet.styles).toHaveLength(1);
    expect(store.getState().sketch.base.character_sheet.styles[0]).toEqual(style);
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('removeSketchBaseStyle filters out by index + sets isDirty', () => {
    const s1 = { style_prompt: 'style 1', is_selected: false, image_references: [], illustrations: [], crops: [] };
    const s2 = { style_prompt: 'style 2', is_selected: false, image_references: [], illustrations: [], crops: [] };
    store.getState().addSketchBaseStyle('characters', s1);
    store.getState().addSketchBaseStyle('characters', s2);
    store.getState().removeSketchBaseStyle('characters', 0);
    expect(store.getState().sketch.base.character_sheet.styles).toHaveLength(1);
    expect(store.getState().sketch.base.character_sheet.styles[0].style_prompt).toBe('style 2');
  });

  it('removeSketchBaseStyle no-ops on out-of-range index (isDirty stays false)', () => {
    store.getState().addSketchBaseStyle('characters', {
      style_prompt: 'test style',
      is_selected: false,
      image_references: [],
      illustrations: [],
      crops: [],
    });
    resetDirty();
    store.getState().removeSketchBaseStyle('characters', 99);
    expect(store.getState().sketch.base.character_sheet.styles).toHaveLength(1);
    expect(store.getState().sync.isDirty).toBe(false);
  });

  it('addSketchBaseStyleIllustration prepends + sets is_selected true + clears others', () => {
    store.getState().addSketchBaseStyle('characters', {
      style_prompt: 'test style',
      is_selected: false,
      image_references: [],
      illustrations: [
        { type: 'created' as const, media_url: 'old.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
      ],
      crops: [],
    });

    store.getState().addSketchBaseStyleIllustration('characters', 0, 'new.png');

    const illustrations = store.getState().sketch.base.character_sheet.styles[0].illustrations;
    expect(illustrations).toHaveLength(2);
    expect(illustrations[0].media_url).toBe('new.png');
    expect(illustrations[0].is_selected).toBe(true);
    expect(illustrations[1].media_url).toBe('old.png');
    expect(illustrations[1].is_selected).toBe(false);
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('setSketchBaseStyleIllustrations replaces the array', () => {
    store.getState().addSketchBaseStyle('characters', {
      style_prompt: 'test style',
      is_selected: false,
      image_references: [],
      illustrations: [
        { type: 'created' as const, media_url: 'old.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
      ],
      crops: [],
    });

    const newIlls = [
      { type: 'created' as const, media_url: 'new1.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
      { type: 'created' as const, media_url: 'new2.png', created_time: '2026-07-13T00:00:00Z', is_selected: false },
    ];
    store.getState().setSketchBaseStyleIllustrations('characters', 0, newIlls);

    const illustrations = store.getState().sketch.base.character_sheet.styles[0].illustrations;
    expect(illustrations).toHaveLength(2);
    expect(illustrations[0].media_url).toBe('new1.png');
    expect(illustrations[1].media_url).toBe('new2.png');
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('setSketchBaseStyleCrops replaces crops array', () => {
    store.getState().addSketchBaseStyle('characters', {
      style_prompt: 'test style',
      is_selected: false,
      image_references: [],
      illustrations: [],
      crops: [
        {
          key: 'hero',
          illustrations: [
            { type: 'created' as const, media_url: 'old-crop.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
          ],
        },
      ],
    });

    const newCrops = [
      {
        key: 'hero',
        illustrations: [
          { type: 'created' as const, media_url: 'new-crop.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
        ],
      },
      {
        key: 'villain',
        illustrations: [
          { type: 'created' as const, media_url: 'villain-crop.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
        ],
      },
    ];
    store.getState().setSketchBaseStyleCrops('characters', 0, newCrops);

    const crops = store.getState().sketch.base.character_sheet.styles[0].crops;
    expect(crops).toHaveLength(2);
    expect(crops[0].key).toBe('hero');
    expect(crops[0].illustrations[0].media_url).toBe('new-crop.png');
    expect(crops[1].key).toBe('villain');
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('setSketchBaseCropIllustrations replaces one crop\'s illustrations', () => {
    store.getState().addSketchBaseStyle('characters', {
      style_prompt: 'test style',
      is_selected: false,
      image_references: [],
      illustrations: [],
      crops: [
        {
          key: 'hero',
          illustrations: [
            { type: 'created' as const, media_url: 'old.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
          ],
        },
        {
          key: 'villain',
          illustrations: [
            { type: 'created' as const, media_url: 'villain.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
          ],
        },
      ],
    });

    const newIlls = [
      { type: 'created' as const, media_url: 'new-hero.png', created_time: '2026-07-13T00:00:00Z', is_selected: true },
    ];
    store.getState().setSketchBaseCropIllustrations('characters', 0, 'hero', newIlls);

    const crops = store.getState().sketch.base.character_sheet.styles[0].crops;
    expect(crops[0].illustrations[0].media_url).toBe('new-hero.png');
    // Villain untouched
    expect(crops[1].illustrations[0].media_url).toBe('villain.png');
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('setSketchBaseStyleSelected sets is_selected exclusive per sheet + clones crops into entity variants[base].raw_sheet.crops[0]', () => {
    // Setup entities
    store.getState().setSketchEntities('characters', [
      { key: 'hero', variants: [variant('base')] },
      { key: 'villain', variants: [variant('base')] },
    ]);

    // Setup styles with crops
    const heroIll = { type: 'created' as const, media_url: 'hero-crop.png', created_time: '2026-07-13T00:00:00Z', is_selected: true };
    const villainIll = { type: 'created' as const, media_url: 'villain-crop.png', created_time: '2026-07-13T00:00:00Z', is_selected: true };

    store.getState().addSketchBaseStyle('characters', {
      style_prompt: 'style 1',
      is_selected: true,
      image_references: [],
      illustrations: [],
      crops: [
        { key: 'hero', illustrations: [heroIll] },
        { key: 'villain', illustrations: [villainIll] },
      ],
    });
    store.getState().addSketchBaseStyle('characters', {
      style_prompt: 'style 2',
      is_selected: false,
      image_references: [],
      illustrations: [],
      crops: [
        { key: 'hero', illustrations: [{ type: 'created' as const, media_url: 'hero-crop-2.png', created_time: '2026-07-13T00:00:00Z', is_selected: true }] },
      ],
    });

    // Select style 1 → crops cloned into entities
    store.getState().setSketchBaseStyleSelected('characters', 1); // st2

    // Assert exclusive is_selected
    expect(store.getState().sketch.base.character_sheet.styles[0].is_selected).toBe(false);
    expect(store.getState().sketch.base.character_sheet.styles[1].is_selected).toBe(true);

    // Assert crops cloned into variants[base].raw_sheet.crops[0] (base invariant: 1 crop,
    // is_selected=true, raw_sheet.illustrations empty).
    const heroBase = store.getState().sketch.characters[0].variants.find((v: SketchVariant) => v.key === 'base');
    const villainBase = store.getState().sketch.characters[1].variants.find((v: SketchVariant) => v.key === 'base');
    expect(heroBase?.raw_sheet?.illustrations).toEqual([]);
    expect(heroBase?.raw_sheet?.crops).toHaveLength(1);
    expect(heroBase?.raw_sheet?.crops[0].is_selected).toBe(true);
    expect(heroBase?.raw_sheet?.crops[0].illustrations[0].media_url).toBe('hero-crop-2.png');
    expect(villainBase?.raw_sheet).toBeUndefined(); // no crop in st2 for villain → untouched
  });

  it('setSketchBaseStyleSelected clones with isolation (clone is separate object, not reference)', () => {
    // Setup entity
    store.getState().setSketchEntities('characters', [
      { key: 'hero', variants: [variant('base')] },
    ]);

    const cropIll = { type: 'created' as const, media_url: 'hero-crop.png', created_time: '2026-07-13T00:00:00Z', is_selected: true };
    store.getState().addSketchBaseStyle('characters', {
      style_prompt: 'test style',
      is_selected: false,
      image_references: [],
      illustrations: [],
      crops: [{ key: 'hero', illustrations: [cropIll] }],
    });

    // Select style
    store.getState().setSketchBaseStyleSelected('characters', 0);

    // Get the cloned crop from variant
    const heroBase = store.getState().sketch.characters[0].variants.find((v: SketchVariant) => v.key === 'base');
    const clonedCropIll = heroBase?.raw_sheet?.crops[0].illustrations[0];

    // Get the original crop in the style
    const style = store.getState().sketch.base.character_sheet.styles[0];
    const originalCropIll = style.crops[0].illustrations[0];

    // Assert they are separate objects (deep clone, not reference)
    // Same values but different object identity
    expect(clonedCropIll).not.toBe(originalCropIll);
    expect(clonedCropIll?.media_url).toBe(originalCropIll.media_url);
    expect(clonedCropIll?.type).toBe(originalCropIll.type);
    expect(clonedCropIll?.is_selected).toBe(originalCropIll.is_selected);
  });

  it('updateSketchBaseEntityText updates only provided fields, leaves others untouched', () => {
    store.getState().setSketchEntities('characters', [
      { key: 'hero', variants: [{ key: 'base', description: 'old desc', height: 110, visual_design: 'old design', art_language: 'old lang' }] },
    ]);
    resetDirty();

    store.getState().updateSketchBaseEntityText('characters', 'hero', {
      visual_design: 'new design',
      art_language: 'new lang',
    });

    const base = store.getState().sketch.characters[0].variants[0];
    expect(base.visual_design).toBe('new design');
    expect(base.art_language).toBe('new lang');
    expect(base.description).toBe('old desc'); // not in the patch → untouched
    expect(base.height).toBe(110); // not in the patch → untouched
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('updateSketchBaseEntityText persists description + height when provided (merged Edit modal)', () => {
    store.getState().setSketchEntities('characters', [
      { key: 'hero', variants: [{ key: 'base', description: 'original', height: 100, visual_design: '', art_language: '' }] },
    ]);
    resetDirty();

    store.getState().updateSketchBaseEntityText('characters', 'hero', {
      description: 'edited desc',
      height: 105,
      visual_design: 'new',
    });

    const base = store.getState().sketch.characters[0].variants[0];
    expect(base.description).toBe('edited desc');
    expect(base.height).toBe(105);
    expect(base.visual_design).toBe('new');
  });

  it('updateSketchBaseEntityText clears height when passed null (null = xoá, undefined = giữ)', () => {
    store.getState().setSketchEntities('characters', [
      { key: 'hero', variants: [{ key: 'base', description: '', height: 110, visual_design: '', art_language: '' }] },
    ]);
    resetDirty();

    store.getState().updateSketchBaseEntityText('characters', 'hero', { height: null });

    expect(store.getState().sketch.characters[0].variants[0].height).toBeNull();
  });

  it('setSketchBaseStyleImageReferences replaces image_references on the target style', () => {
    store.getState().addSketchBaseStyle('characters', {
      style_prompt: 's', is_selected: false, image_references: [], illustrations: [], crops: [],
    });
    resetDirty();

    store.getState().setSketchBaseStyleImageReferences('characters', 0, [
      { title: 'ref-a.jpg', media_url: 'https://cdn/a.png' },
    ]);

    const style = store.getState().sketch.base.character_sheet.styles[0];
    expect(style.image_references).toEqual([{ title: 'ref-a.jpg', media_url: 'https://cdn/a.png' }]);
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('normalizeSketch defaults missing base to emptyBase() (2 empty sheets)', () => {
    const raw = {
      id: 'sk1',
      characters: [entity('hero')],
      props: [],
      stages: [],
      spreads: [],
      // no base field
    };
    const result = normalizeSketch(raw);
    expect(result.base).toEqual({
      character_sheet: { styles: [] },
      prop_sheet: { styles: [] },
    });
  });

  it('normalizeSketch coerces missing variant text fields to empty string', () => {
    const raw = {
      id: 'sk1',
      base: { character_sheet: { styles: [] }, prop_sheet: { styles: [] } },
      characters: [
        {
          key: 'hero',
          variants: [
            {
              key: 'base',
              // missing description, visual_design, art_language
            },
          ],
        },
      ],
      props: [],
      stages: [],
      spreads: [],
    };
    const result = normalizeSketch(raw);
    const heroBase = result.characters[0].variants[0];
    expect(heroBase.description).toBe('');
    expect(heroBase.visual_design).toBe('');
    expect(heroBase.art_language).toBe('');
  });

  it('normalizeSketch preserves valid base workspace', () => {
    const base = {
      character_sheet: {
        styles: [
          {
            style_prompt: 'test style',
            is_selected: false,
            image_references: [],
            illustrations: [],
            crops: [],
          },
        ],
      },
      prop_sheet: { styles: [] },
    };
    const raw = {
      id: 'sk1',
      base,
      characters: [],
      props: [],
      stages: [],
      spreads: [],
    };
    const result = normalizeSketch(raw);
    expect(result.base).toEqual(base);
  });
});

describe('SketchSlice variant crop model (coerce back-compat + positional crops[])', () => {
  const emptyBase = () => ({ character_sheet: { styles: [] }, prop_sheet: { styles: [] } });

  it('coerces a legacy variant.crop (no raw_sheet) into raw_sheet.crops[0] is_selected=true (lossless)', () => {
    const raw = {
      id: 'sk1',
      base: emptyBase(),
      characters: [
        {
          key: 'hero',
          variants: [
            {
              key: 'hero_v', description: '', visual_design: '', art_language: '',
              crop: { illustrations: [{ type: 'created', media_url: 'legacy.png', created_time: 't', is_selected: true }] },
            },
          ],
        },
      ],
      props: [], stages: [], spreads: [],
    };
    const v = normalizeSketch(raw).characters[0].variants[0];
    expect(v.raw_sheet?.illustrations).toEqual([]);
    expect(v.raw_sheet?.crops).toHaveLength(1);
    expect(v.raw_sheet?.crops[0].is_selected).toBe(true);
    expect(v.raw_sheet?.crops[0].illustrations[0].media_url).toBe('legacy.png');
  });

  it('coerces a legacy raw_sheet.illustrations + old crop (no crops[]) → crops[0] mapped', () => {
    const raw = {
      id: 'sk1',
      base: emptyBase(),
      characters: [
        {
          key: 'hero',
          variants: [
            {
              key: 'hero_v', description: '', visual_design: '', art_language: '',
              raw_sheet: { illustrations: [{ type: 'created', media_url: 'sheet.png', created_time: 't', is_selected: true }] },
              crop: { illustrations: [{ type: 'created', media_url: 'crop.png', created_time: 't', is_selected: true }] },
            },
          ],
        },
      ],
      props: [], stages: [], spreads: [],
    };
    const v = normalizeSketch(raw).characters[0].variants[0];
    expect(v.raw_sheet?.illustrations[0].media_url).toBe('sheet.png');
    expect(v.raw_sheet?.crops).toHaveLength(1);
    expect(v.raw_sheet?.crops[0].illustrations[0].media_url).toBe('crop.png');
  });

  it('coerces a new raw_sheet.crops[] positional array (is_selected defaults false when absent)', () => {
    const raw = {
      id: 'sk1',
      base: emptyBase(),
      characters: [
        {
          key: 'hero',
          variants: [
            {
              key: 'hero_v', description: '', visual_design: '', art_language: '',
              raw_sheet: {
                illustrations: [],
                crops: [
                  { illustrations: [{ type: 'created', media_url: 'c0.png', created_time: 't', is_selected: true }] }, // no is_selected → false
                  { is_selected: true, illustrations: [] },
                ],
              },
            },
          ],
        },
      ],
      props: [], stages: [], spreads: [],
    };
    const crops = normalizeSketch(raw).characters[0].variants[0].raw_sheet!.crops;
    expect(crops).toHaveLength(2);
    expect(crops[0].is_selected).toBe(false);
    expect(crops[0].illustrations[0].media_url).toBe('c0.png');
    expect(crops[1].is_selected).toBe(true);
    expect(crops[1].illustrations).toEqual([]);
  });
});

describe('SketchSlice variant crop actions (positional crops[])', () => {
  let store: ReturnType<typeof createTestStore>;
  beforeEach(() => {
    store = createTestStore();
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resetDirty = () => store.setState((s: any) => { s.sync.isDirty = false; });

  const ill = (url: string) => ({ type: 'created' as const, media_url: url, created_time: 't', is_selected: true });

  // Seed a char entity: a 'base' variant (no imagery) + 'hero_v' with raw_sheet + 2 positional crops.
  const seedVariantWithCrops = () =>
    store.getState().setSketchEntities('characters', [
      {
        key: 'hero',
        variants: [
          { key: 'base', description: '', visual_design: '', art_language: '' },
          {
            key: 'hero_v', description: '', visual_design: '', art_language: '',
            raw_sheet: {
              illustrations: [],
              crops: [
                { is_selected: false, illustrations: [ill('c0.png')] },
                { is_selected: false, illustrations: [ill('c1.png')] },
              ],
            },
          },
        ],
      },
    ]);

  const heroV = () =>
    store.getState().sketch.characters[0].variants.find((v: SketchVariant) => v.key === 'hero_v');

  it('setSketchVariantCrops replaces raw_sheet.crops[] + sets isDirty', () => {
    seedVariantWithCrops();
    resetDirty();
    store.getState().setSketchVariantCrops('characters', 'hero', 'hero_v', [
      { is_selected: true, illustrations: [ill('n0.png')] },
    ]);
    expect(heroV().raw_sheet.crops).toHaveLength(1);
    expect(heroV().raw_sheet.crops[0].illustrations[0].media_url).toBe('n0.png');
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('setSketchVariantCrops creates raw_sheet (illustrations empty) when absent', () => {
    store.getState().setSketchEntities('characters', [
      { key: 'hero', variants: [{ key: 'hero_v', description: '', visual_design: '', art_language: '' }] },
    ]);
    store.getState().setSketchVariantCrops('characters', 'hero', 'hero_v', [{ is_selected: false, illustrations: [] }]);
    expect(heroV().raw_sheet.illustrations).toEqual([]);
    expect(heroV().raw_sheet.crops).toHaveLength(1);
  });

  it('setSketchVariantCrops no-ops when the variant is missing (isDirty stays false)', () => {
    seedVariantWithCrops();
    resetDirty();
    store.getState().setSketchVariantCrops('characters', 'hero', 'ghost', [{ is_selected: false, illustrations: [] }]);
    expect(store.getState().sync.isDirty).toBe(false);
  });

  it('selectSketchVariantCrop locks exactly one cell (≤1 is_selected), re-select clears the prior', () => {
    seedVariantWithCrops();
    store.getState().selectSketchVariantCrop('characters', 'hero', 'hero_v', 1);
    let crops = heroV().raw_sheet.crops;
    expect(crops.filter((c: SketchVariantCrop) => c.is_selected)).toHaveLength(1);
    expect(crops[1].is_selected).toBe(true);
    expect(crops[0].is_selected).toBe(false);
    // Re-select a different cell → previous flag cleared.
    store.getState().selectSketchVariantCrop('characters', 'hero', 'hero_v', 0);
    crops = heroV().raw_sheet.crops;
    expect(crops.filter((c: SketchVariantCrop) => c.is_selected)).toHaveLength(1);
    expect(crops[0].is_selected).toBe(true);
    expect(crops[1].is_selected).toBe(false);
  });

  it('selectSketchVariantCrop no-ops on out-of-range cropIndex (isDirty stays false)', () => {
    seedVariantWithCrops();
    resetDirty();
    store.getState().selectSketchVariantCrop('characters', 'hero', 'hero_v', 9);
    expect(store.getState().sync.isDirty).toBe(false);
    expect(heroV().raw_sheet.crops.filter((c: SketchVariantCrop) => c.is_selected)).toHaveLength(0);
  });

  it('setSketchVariantCropIllustrations writes only crops[cropIndex].illustrations', () => {
    seedVariantWithCrops();
    store.getState().setSketchVariantCropIllustrations('characters', 'hero', 'hero_v', 1, [ill('edited.png')]);
    const crops = heroV().raw_sheet.crops;
    expect(crops[1].illustrations[0].media_url).toBe('edited.png');
    expect(crops[0].illustrations[0].media_url).toBe('c0.png'); // untouched
    expect(store.getState().sync.isDirty).toBe(true);
  });

  it('setSketchVariantCropIllustrations no-ops on missing cropIndex (isDirty stays false)', () => {
    seedVariantWithCrops();
    resetDirty();
    store.getState().setSketchVariantCropIllustrations('characters', 'hero', 'hero_v', 9, [ill('x.png')]);
    expect(store.getState().sync.isDirty).toBe(false);
  });

  it('setSketchVariantRawSheetIllustrations preserves existing crops[] (does not wipe)', () => {
    seedVariantWithCrops();
    store.getState().setSketchVariantRawSheetIllustrations('characters', 'hero', 'hero_v', [ill('sheet.png')]);
    const rs = heroV().raw_sheet;
    expect(rs.illustrations[0].media_url).toBe('sheet.png');
    expect(rs.crops).toHaveLength(2); // preserved
    expect(rs.crops[0].illustrations[0].media_url).toBe('c0.png');
  });

  it('setSketchVariantRawSheetIllustrations on a variant with no raw_sheet yields empty crops[]', () => {
    store.getState().setSketchEntities('characters', [
      { key: 'hero', variants: [{ key: 'hero_v', description: '', visual_design: '', art_language: '' }] },
    ]);
    store.getState().setSketchVariantRawSheetIllustrations('characters', 'hero', 'hero_v', [ill('s.png')]);
    expect(heroV().raw_sheet.crops).toEqual([]);
  });
});
