import { describe, it, expect } from 'vitest';
import {
  buildCharacters,
  buildProps,
  buildStages,
  projectSketchEntities,
  titlecase,
} from '../build-snapshot-from-parsed';
import { buildFixtureWorkbook, buildFixtureSketchSnapshot } from './fixtures/sketch-manuscript-fixture';

describe('titlecase', () => {
  it('splits on underscore/space and capitalizes', () => {
    expect(titlecase('house_night')).toBe('House Night');
    expect(titlecase('kid')).toBe('Kid');
    expect(titlecase('')).toBe('');
  });
});

describe('entity mappers', () => {
  const parsed = buildFixtureWorkbook();

  it('characters: titlecase names, variant types, empty defaults, null voice', () => {
    const chars = buildCharacters(parsed.characters);
    expect(chars).toHaveLength(7);
    const kid = chars[0];
    expect(kid).toMatchObject({ key: 'kid', name: 'Kid', order: 0, voice_setting: null });
    expect(kid.basic_info.description).toBe('');
    expect(kid.personality.core_essence).toBe('');
    expect(kid.variants[0]).toMatchObject({ key: 'base', type: 0, name: 'Base' });
    expect(kid.variants[1]).toMatchObject({ key: 'hero', type: 1, name: 'Hero' });
    expect(kid.variants[0].visual_description).toBe('Mô tả kid base');
  });

  it('props: default type narrative, empty category, no sounds', () => {
    const props = buildProps(parsed.props);
    expect(props).toHaveLength(6);
    expect(props[0]).toMatchObject({ key: 'armor', type: 'narrative', category_id: '', sounds: [] });
    expect(props[0].variants.map((v) => v.key)).toEqual(['base', 'glow']);
  });

  it('stages: empty location, nested temporal/sensory/emotional defaults', () => {
    const stages = buildStages(parsed.stages);
    expect(stages).toHaveLength(8);
    const houseNight = stages[0];
    expect(houseNight).toMatchObject({ key: 'house_night', name: 'House Night', location_id: '' });
    expect(houseNight.variants[0].temporal.era).toBe('');
    expect(houseNight.variants[0].sensory.lighting).toBe('');
    expect(houseNight.variants[0].emotional.mood).toBe('');
  });
});

describe('projectSketchEntities', () => {
  it('projects the full catalog to thin { key, variants[{ key, description, visual_design, art_language }] }', () => {
    const chars = buildCharacters(buildFixtureWorkbook().characters);
    const projected = projectSketchEntities(chars);
    expect(projected).toHaveLength(chars.length);
    const kid = projected[0];
    expect(kid).toEqual({
      key: 'kid',
      variants: [
        { key: 'base', description: '', visual_design: 'Mô tả kid base', art_language: '' },
        { key: 'hero', description: '', visual_design: 'Mô tả kid hero', art_language: '' },
      ],
    });
  });
});

describe('assembleSketchSnapshot', () => {
  const { snapshot, issues } = buildFixtureSketchSnapshot();

  it('builds the sketch with spreads (images always []) + a fresh id + no errors', () => {
    expect(issues.errors).toEqual([]);
    expect(snapshot.sketch.id).toBeTruthy();
    expect(snapshot.sketch.spreads).toHaveLength(3);
    expect(snapshot.sketch.spreads.every((s) => s.images.length === 0)).toBe(true);
  });

  it('carries the full top-level entity catalog (7/6/8)', () => {
    expect(snapshot.characters).toHaveLength(7);
    expect(snapshot.props).toHaveLength(6);
    expect(snapshot.stages).toHaveLength(8);
  });

  it('sketch entity projection stays in sync with the full catalog (keys + descriptions)', () => {
    expect(snapshot.sketch.characters.map((c) => c.key)).toEqual(snapshot.characters.map((c) => c.key));
    expect(snapshot.sketch.stages).toHaveLength(8);
    expect(snapshot.sketch.characters[0]).toEqual({
      key: 'kid',
      variants: [
        { key: 'base', description: '', visual_design: 'Mô tả kid base', art_language: '' },
        { key: 'hero', description: '', visual_design: 'Mô tả kid hero', art_language: '' },
      ],
    });
  });
});
