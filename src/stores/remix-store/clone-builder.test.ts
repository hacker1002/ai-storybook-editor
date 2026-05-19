// clone-builder.test.ts — Unit tests for buildRemixClonePayload pure transform.
// Covers Phase 03 spec: exactly 1 crop sheet per config-enabled key, drop
// chunking, subject-tag-count classification (role/`other` tags excluded from
// single-vs-mix), mix dedup by canonical sorted-key signature.

import { describe, it, expect } from 'vitest';
import { buildRemixClonePayload } from './clone-builder';
import type { CloneBuilderInput } from './clone-builder';
import type { RemixConfig } from '@/types/remix';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import type { IllustrationData } from '@/types/illustration-types';
import type { SpreadImage, SpreadTag } from '@/types/spread-types';

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeChar(key: string, name: string): Character {
  return {
    key,
    name,
    description: '',
    variants: [],
    crop_sheets: [],
  } as unknown as Character;
}

function makeProp(key: string, name: string): Prop {
  return {
    key,
    name,
    description: '',
    variants: [],
    crop_sheets: [],
    sounds: [],
  } as unknown as Prop;
}

/** Tag helpers — `subject` counts toward classification, `role` (type=other) does not. */
function subjectTag(type: 'character' | 'prop', objectKey: string, variant = 'v1'): SpreadTag {
  return { type, object_key: objectKey, variant_key: variant };
}
function roleTag(objectKey: 'background' | 'foreground' | 'vfx' = 'background'): SpreadTag {
  return { type: 'other', object_key: objectKey, variant_key: null };
}

/** A tagged image layer on a spread. */
function makeImage(id: string, tags: SpreadTag[]): SpreadImage {
  return {
    id,
    media_url: `https://cdn/${id}.png`,
    aspect_ratio: '1:1',
    geometry: { x: 0, y: 0, w: 100, h: 100 },
    'z-index': 0,
    tags,
  } as unknown as SpreadImage;
}

/** A minimal spread carrying tagged image layers. */
function makeSpread(id: string, pageNumber: number, images: SpreadImage[]) {
  return {
    id,
    pages: [{ number: pageNumber, type: 'normal_page', layout: null, background: { color: '#fff', texture: null } }],
    images,
    textboxes: [],
  };
}

function makeIllustration(spreads: ReturnType<typeof makeSpread>[]): IllustrationData {
  return { spreads, sections: [] } as unknown as IllustrationData;
}

interface BuildOpts {
  characters?: Character[];
  props?: Prop[];
  spreads?: ReturnType<typeof makeSpread>[];
  enabledCharKeys?: string[];
  enabledPropKeys?: string[];
}

/** Build a CloneBuilderInput + RemixConfig. By default every passed character /
 *  prop is config-enabled; override via enabledCharKeys / enabledPropKeys. */
function build(opts: BuildOpts = {}) {
  const characters = opts.characters ?? [];
  const props = opts.props ?? [];
  const enabledCharKeys = opts.enabledCharKeys ?? characters.map((c) => c.key);
  const enabledPropKeys = opts.enabledPropKeys ?? props.map((p) => p.key);

  const input: CloneBuilderInput = {
    snapshotId: 'snap-1',
    illustration: makeIllustration(opts.spreads ?? []),
    characters,
    props,
  };
  const config: RemixConfig = {
    narrator: { name: 'Narrator', voice_id: null },
    characters: characters.map((c) => ({
      key: c.key,
      human_id: null,
      visual: null,
      voice_id: null,
      is_enabled: enabledCharKeys.includes(c.key),
    })),
    props: props.map((p) => ({
      key: p.key,
      prop_id: null,
      visual: null,
      is_enabled: enabledPropKeys.includes(p.key),
    })),
    languages: ['vi_VN'],
  } as unknown as RemixConfig;

  return buildRemixClonePayload(input, config, 'Test Remix');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildRemixClonePayload — clone-builder Phase 03', () => {
  // Case 1: config-enabled char/prop with 0 layer tags → still 1 sheet, crops:[].
  it('config-enabled char/prop with no tagged layer still gets exactly 1 empty sheet', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu')],
      props: [makeProp('p1', 'Sword')],
      spreads: [],
    });
    expect(r.characters).toHaveLength(1);
    expect(r.characters[0].crop_sheets).toHaveLength(1);
    expect(r.characters[0].crop_sheets[0]).toEqual({
      title: 'Miu',
      image_url: '',
      swap_results: [],
      crops: [],
    });
    expect(r.props[0].crop_sheets).toHaveLength(1);
    expect(r.props[0].crop_sheets[0].crops).toEqual([]);
  });

  // Case 2: layer with 1 character subject tag → crop goes to that character.
  it('layer with 1 character subject tag pushes crop into that character sheet', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu')],
      spreads: [makeSpread('s1', 1, [makeImage('img1', [subjectTag('character', 'c1')])])],
    });
    expect(r.characters[0].crop_sheets).toHaveLength(1);
    expect(r.characters[0].crop_sheets[0].crops).toHaveLength(1);
    expect(r.characters[0].crop_sheets[0].crops[0].media_url).toBe('https://cdn/img1.png');
    expect(r.characters[0].crop_sheets[0].crops[0].spread_number).toBe(1);
    expect(r.mixes).toHaveLength(0);
  });

  // Case 3: layer with 2 subject tags → crop goes to mix, NOT to either character.
  it('layer with 2 subject tags pushes crop into a mix, not the 2 characters', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu'), makeChar('c2', 'Lulu')],
      spreads: [
        makeSpread('s1', 1, [
          makeImage('img1', [subjectTag('character', 'c1'), subjectTag('character', 'c2')]),
        ]),
      ],
    });
    expect(r.characters[0].crop_sheets[0].crops).toHaveLength(0);
    expect(r.characters[1].crop_sheets[0].crops).toHaveLength(0);
    expect(r.mixes).toHaveLength(1);
    expect(r.mixes[0].keys).toEqual(['c1', 'c2']);
    expect(r.mixes[0].crop_sheets).toHaveLength(1);
    expect(r.mixes[0].crop_sheets[0].crops).toHaveLength(1);
  });

  // Case 4: BUG GUARD — 1 subject tag + 1 role(`other`) tag → still single-subject.
  // Old code filtered on tags.length (counted ALL tag types) → would skip this.
  it('layer with 1 subject tag + 1 role tag is still classified single-subject', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu')],
      spreads: [
        makeSpread('s1', 1, [
          makeImage('img1', [subjectTag('character', 'c1'), roleTag('background')]),
        ]),
      ],
    });
    // Role tag must NOT bump the subject count → crop lands on the character.
    expect(r.characters[0].crop_sheets[0].crops).toHaveLength(1);
    expect(r.mixes).toHaveLength(0);
  });

  // Case 5: mix dedup — same subject combo across spreads (any tag order) → 1 mix.
  it('dedups mixes by canonical sorted-key signature regardless of tag order', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu'), makeChar('c2', 'Lulu')],
      spreads: [
        makeSpread('s1', 1, [
          makeImage('img1', [subjectTag('character', 'c1'), subjectTag('character', 'c2')]),
        ]),
        makeSpread('s2', 2, [
          makeImage('img2', [subjectTag('character', 'c2'), subjectTag('character', 'c1')]),
        ]),
      ],
    });
    expect(r.mixes).toHaveLength(1);
    expect(r.mixes[0].crop_sheets).toHaveLength(1);
    expect(r.mixes[0].crop_sheets[0].crops).toHaveLength(2);
  });

  // Case 6: every key (char + prop + mix) carries exactly 1 crop sheet.
  it('every char/prop/mix key has crop_sheets.length === 1', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu'), makeChar('c2', 'Lulu')],
      props: [makeProp('p1', 'Sword')],
      spreads: [
        makeSpread('s1', 1, [makeImage('img1', [subjectTag('character', 'c1')])]),
        makeSpread('s2', 2, [makeImage('img2', [subjectTag('prop', 'p1')])]),
        makeSpread('s3', 3, [
          makeImage('img3', [subjectTag('character', 'c1'), subjectTag('prop', 'p1')]),
        ]),
      ],
    });
    for (const c of r.characters) expect(c.crop_sheets).toHaveLength(1);
    for (const p of r.props) expect(p.crop_sheets).toHaveLength(1);
    for (const m of r.mixes) expect(m.crop_sheets).toHaveLength(1);
  });

  // Case 7: disabled config keys are excluded; only enabled keys produce sheets.
  it('excludes config-disabled char/prop keys from the payload', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu'), makeChar('c2', 'Lulu')],
      props: [makeProp('p1', 'Sword')],
      enabledCharKeys: ['c1'],
      enabledPropKeys: [],
      spreads: [],
    });
    expect(r.characters.map((c) => c.key)).toEqual(['c1']);
    expect(r.props).toHaveLength(0);
    expect(r.characters[0].crop_sheets).toHaveLength(1);
  });
});
