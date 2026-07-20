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
    expect(kid.variants[0].appearance.height).toBe(110); // '110cm' → cm number
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
  it('maps each Excel column to its OWN variant field (description ≠ visual_design)', () => {
    const rows = buildFixtureWorkbook().characters;
    const projected = projectSketchEntities(rows);
    expect(projected).toHaveLength(7);
    const kid = projected[0];
    expect(kid).toEqual({
      key: 'kid',
      variants: [
        {
          key: 'base',
          description: 'Mô tả kid base',
          height: 110,
          visual_design: 'Visual kid base',
          art_language: 'Art kid base',
        },
        {
          key: 'hero',
          description: 'Mô tả kid hero',
          height: 110,
          visual_design: 'Visual kid hero',
          art_language: 'Art kid hero',
        },
      ],
    });
  });

  it('an unparseable height only drops the height (variant still imported)', () => {
    const [row] = buildFixtureWorkbook().characters;
    const projected = projectSketchEntities([{ ...row, height: 'cao lắm' }]);
    expect(projected[0].variants[0].height).toBeNull();
    expect(projected[0].variants[0].visual_design).toBe('Visual kid base');
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
    expect(snapshot.sketch.characters[0].variants[0]).toMatchObject({
      key: 'base',
      description: 'Mô tả kid base',
      height: 110,
      visual_design: 'Visual kid base',
      art_language: 'Art kid base',
    });
  });

  it('stages carry no height (Stages sheet has no such column)', () => {
    const bedroom = snapshot.sketch.stages[1];
    expect(bedroom.variants[0]).toMatchObject({
      key: 'base',
      description: 'Mô tả bedroom base',
      visual_design: 'Visual bedroom base',
      art_language: 'Art bedroom base',
    });
    expect('height' in bedroom.variants[0]).toBe(false);
  });
});
