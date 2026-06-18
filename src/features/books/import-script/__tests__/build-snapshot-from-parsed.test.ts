import { describe, it, expect } from 'vitest';
import {
  buildCharacters,
  buildProps,
  buildStages,
  flowOrder,
  titlecase,
} from '../build-snapshot-from-parsed';
import type { BranchLocalizedContent } from '@/types/illustration-types';
import {
  buildFixtureParsed,
  buildFixtureSnapshot,
  CHOICE_PROMPT,
  DEFAULT_LABEL,
  BRANCH_LABEL,
  MODAL_META,
} from './fixtures/visual-manuscript-fixture';

const LANG = MODAL_META.original_language; // 'vi_VN'

describe('titlecase', () => {
  it('splits on underscore/space and capitalizes', () => {
    expect(titlecase('house_night')).toBe('House Night');
    expect(titlecase('kid')).toBe('Kid');
    expect(titlecase('')).toBe('');
  });
});

describe('flowOrder', () => {
  it('orders intro → full default branch → full nhanh_1 branch → merge (§8)', () => {
    const parsed = buildFixtureParsed();
    const order = flowOrder(parsed.nodes, parsed.edges).map((n) => n.node_id);
    expect(order).toEqual([
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
      'truc_chinh.11', 'truc_chinh.12', 'truc_chinh.13', 'truc_chinh.14', 'truc_chinh.15',
      'nhanh_1.11', 'nhanh_1.12', 'nhanh_1.13', 'nhanh_1.14', 'nhanh_1.15',
      '16',
    ]);
  });
});

describe('assembleSnapshot — spreads', () => {
  const snap = buildFixtureSnapshot();
  const spreads = snap.illustration.spreads;

  it('builds 21 spreads with empty playable layers', () => {
    expect(spreads).toHaveLength(21);
    expect(spreads.every((s) => s.images.length === 0 && s.textboxes.length === 0)).toBe(true);
  });

  it('DPS spread → 1 page "0-1" + 1 raw image + 1 raw textbox (full-bleed)', () => {
    const dps = spreads[0]; // node '1' (DPS)
    expect(dps.pages).toHaveLength(1);
    expect(dps.pages[0].number).toBe('0-1');
    expect(dps.raw_images).toHaveLength(1);
    expect(dps.raw_textboxes).toHaveLength(1);
    expect(dps.raw_images![0].geometry).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it('2-page spread → 2 pages + 2 raw images + 2 raw textboxes', () => {
    const two = spreads[1]; // node '2' (2-page)
    expect(two.pages.map((p) => p.number)).toEqual([2, 3]);
    expect(two.raw_images).toHaveLength(2);
    expect(two.raw_textboxes).toHaveLength(2);
    expect(two.raw_images![1].geometry).toEqual({ x: 50, y: 0, w: 50, h: 100 });
  });

  it('page numbers are GLOBALLY sequential across the book (+2 per spread, no duplicates)', () => {
    // Regression: every spread previously carried the same hardcoded "0-1" / "0","1".
    expect(spreads[0].pages[0].number).toBe('0-1'); // DPS node 1
    expect(spreads[1].pages.map((p) => p.number)).toEqual([2, 3]); // 2-page node 2
    expect(spreads[2].pages.map((p) => p.number)).toEqual([4, 5]); // 2-page node 3
    expect(spreads[3].pages[0].number).toBe('6-7'); // DPS node 4
    expect(spreads[20].pages[0].number).toBe('40-41'); // DPS node 16 (last)

    // No two spreads share a leading page number → filmstrip labels are unique.
    const leads = spreads.map((s) => String(s.pages[0].number));
    expect(new Set(leads).size).toBe(spreads.length);
  });

  it('raw image carries content fields, no media, hidden from player', () => {
    const img = spreads[0].raw_images![0];
    expect(img).toMatchObject({
      player_visible: false,
      editor_visible: true,
      illustrations: [],
      image_references: [],
      // Chỉ đạo hình ảnh (art direction) → visual_description; Diễn biến (scene beat) → art_note
      visual_description: 'Góc máy 1 TRÁI',
      art_note: 'Cảnh 1 TRÁI',
      stage_variant: '@bedroom/base',
    });
    expect('media_url' in img).toBe(false);
  });

  it('raw textbox carries localized text under the book language', () => {
    const tb = spreads[1].raw_textboxes![0];
    const content = tb[LANG] as { text: string; geometry: unknown; typography: unknown };
    expect(content.text).toBe('Lời văn 2 TRÁI');
    expect(content.geometry).toBeDefined();
    expect(content.typography).toBeDefined();
  });

  it('manuscript concatenates Diễn biến across pages', () => {
    expect(spreads[1].manuscript).toBe('Cảnh 2 TRÁI\nCảnh 2 PHẢI');
  });
});

describe('assembleSnapshot — sections + branch_setting', () => {
  const snap = buildFixtureSnapshot();
  const spreads = snap.illustration.spreads;
  const sections = snap.illustration.sections;
  const mergeSpreadId = spreads[20].id; // node '16'

  it('creates 2 branch sections, both pointing next_spread_id at the merge (16)', () => {
    expect(sections).toHaveLength(2);
    expect(sections.every((s) => s.next_spread_id === mergeSpreadId)).toBe(true);
  });

  it('section bounds match the branch runs', () => {
    const tc = sections.find((s) => s.start_spread_id === spreads[10].id)!; // truc_chinh.11
    expect(tc.end_spread_id).toBe(spreads[14].id); // truc_chinh.15
    const n1 = sections.find((s) => s.start_spread_id === spreads[15].id)!; // nhanh_1.11
    expect(n1.end_spread_id).toBe(spreads[19].id); // nhanh_1.15
  });

  it('attaches branch_setting to the choice spread (node 10) with ordered branches', () => {
    const choiceSpread = spreads[9]; // node '10'
    const bs = choiceSpread.branch_setting!;
    expect(bs).toBeDefined();
    expect((bs[LANG] as BranchLocalizedContent).title).toBe(CHOICE_PROMPT);
    expect(bs.branches).toHaveLength(2);

    expect(bs.branches[0].is_default).toBe(true);
    expect((bs.branches[0][LANG] as BranchLocalizedContent).title).toBe(DEFAULT_LABEL);
    expect(bs.branches[0].section_id).toBe(sections.find((s) => s.start_spread_id === spreads[10].id)!.id);

    expect(bs.branches[1].is_default).toBe(false);
    expect((bs.branches[1][LANG] as BranchLocalizedContent).title).toBe(BRANCH_LABEL);
  });

  it('non-choice spreads carry no branch_setting', () => {
    expect(spreads[0].branch_setting).toBeUndefined();
  });
});

describe('entity mappers', () => {
  const parsed = buildFixtureParsed();

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
    expect(props[0]).toMatchObject({ key: 'crystal', type: 'narrative', category_id: '', sounds: [] });
    expect(props[0].variants.map((v) => v.key)).toEqual(['base', 'glow']);
  });

  it('stages: empty location, nested temporal/sensory/emotional defaults', () => {
    const stages = buildStages(parsed.stages);
    expect(stages).toHaveLength(8);
    const bedroom = stages[0];
    expect(bedroom).toMatchObject({ key: 'bedroom', location_id: '' });
    expect(bedroom.variants.map((v) => v.key)).toEqual(['base', 'night', 'day']);
    expect(bedroom.variants[0].temporal.era).toBe('');
    expect(bedroom.variants[0].sensory.lighting).toBe('');
    expect(bedroom.variants[0].emotional.mood).toBe('');
  });
});

describe('buildScriptDoc', () => {
  it('builds a single type:script doc with narration in flow order', () => {
    const snap = buildFixtureSnapshot();
    expect(snap.docs).toHaveLength(1);
    expect(snap.docs[0].type).toBe('script');
    expect(snap.docs[0].title).toBe(MODAL_META.title);
    expect(snap.docs[0].content).toContain('Lời văn 1');
    expect(snap.docs[0].content).toContain('Lời văn 16');
  });
});
