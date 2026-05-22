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
import type { SpreadImage, SpreadAutoPic, SpreadTag } from '@/types/spread-types';

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

/** A tagged auto_pic (animated, e.g. .lottie) layer — must NOT become a crop. */
function makeAutoPic(id: string, tags: SpreadTag[]): SpreadAutoPic {
  return {
    id,
    media_url: `https://cdn/${id}.lottie`,
    geometry: { x: 0, y: 0, w: 100, h: 100 },
    'z-index': 0,
    tags,
  } as unknown as SpreadAutoPic;
}

/** A minimal spread carrying tagged image (and optionally auto_pic) layers. */
function makeSpread(
  id: string,
  pageNumber: number,
  images: SpreadImage[],
  autoPics: SpreadAutoPic[] = [],
) {
  return {
    id,
    pages: [{ number: pageNumber, type: 'normal_page', layout: null, background: { color: '#fff', texture: null } }],
    images,
    auto_pics: autoPics,
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
      title: 'sheet 1',
      sheet_geometry: { width: 0, height: 0 },
      image_url: '',
      swap_results: [],
      crops: [],
      variant_key: null,
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
    // keys are now a variant-qualified full-cast lineup (`${key}/${variant}`).
    expect(r.mixes[0].keys).toEqual(['c1/v1', 'c2/v1']);
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

  // Case 8: BUG GUARD — an auto_pic (animated, e.g. .lottie) layer tagged to a
  // subject must NOT become a crop. Crop sheets carry static-image crops only.
  it('ignores tagged auto_pic (animated) layers — no crop produced', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu')],
      spreads: [
        makeSpread('s1', 1, [], [makeAutoPic('anim1', [subjectTag('character', 'c1')])]),
      ],
    });
    expect(r.characters[0].crop_sheets[0].crops).toEqual([]);
  });

  // Case 9: only 1 of 2 co-occurring subjects enabled → not a mix; fold into
  // the enabled entity (leela enabled, didi disabled → leela crop, 0 mixes).
  it('folds a co-occurrence into the single enabled subject when others are disabled', () => {
    const r = build({
      characters: [makeChar('leela', 'Leela'), makeChar('didi', 'Didi')],
      enabledCharKeys: ['leela'],
      spreads: [
        makeSpread('s1', 1, [
          makeImage('img1', [
            subjectTag('character', 'didi'),
            subjectTag('character', 'leela'),
          ]),
        ]),
      ],
    });
    expect(r.characters.map((c) => c.key)).toEqual(['leela']);
    expect(r.characters[0].crop_sheets[0].crops).toHaveLength(1);
    expect(r.mixes).toHaveLength(0);
  });
});

// ── Variant-lineup mixes (full-cast, base-variant dedup) ─────────────────────

function makeCharVariants(
  key: string,
  name: string,
  variants: { key: string; type: 0 | 1 }[],
): Character {
  return {
    key,
    name,
    description: '',
    variants: variants.map((v) => ({ key: v.key, name: v.key, type: v.type })),
    crop_sheets: [],
  } as unknown as Character;
}
function makePropVariants(
  key: string,
  name: string,
  variants: { key: string; type: 0 | 1 }[],
): Prop {
  return {
    key,
    name,
    description: '',
    variants: variants.map((v) => ({ key: v.key, name: v.key, type: v.type })),
    crop_sheets: [],
    sounds: [],
  } as unknown as Prop;
}

describe('buildRemixClonePayload — variant-lineup mixes', () => {
  // User spec: A(a1,a2), B(b1), C(c1), prop D(d1) enabled. Two groups emerge:
  //   group1 {A/a1,B/b1,C/c1,D/d1} ← (a1,b1),(b1,c1),(b1,c1,d1)  (A base-filled)
  //   group2 {A/a2,B/b1,C/c1,D/d1} ← (a2,c1),(a2,d1)
  it('groups multi-subject crops by full-cast variant lineup with base-variant dedup', () => {
    const r = build({
      characters: [
        makeCharVariants('A', 'Aria', [
          { key: 'a1', type: 0 },
          { key: 'a2', type: 1 },
        ]),
        makeCharVariants('B', 'Bee', [{ key: 'b1', type: 0 }]),
        makeCharVariants('C', 'Cleo', [{ key: 'c1', type: 0 }]),
      ],
      props: [makePropVariants('D', 'Drum', [{ key: 'd1', type: 0 }])],
      spreads: [
        makeSpread('s1', 1, [
          makeImage('i1', [subjectTag('character', 'A', 'a1'), subjectTag('character', 'B', 'b1')]),
          makeImage('i2', [subjectTag('character', 'B', 'b1'), subjectTag('character', 'C', 'c1')]),
        ]),
        makeSpread('s2', 2, [
          makeImage('i3', [
            subjectTag('character', 'B', 'b1'),
            subjectTag('character', 'C', 'c1'),
            subjectTag('prop', 'D', 'd1'),
          ]),
          makeImage('i4', [subjectTag('character', 'A', 'a2'), subjectTag('character', 'C', 'c1')]),
          makeImage('i5', [subjectTag('character', 'A', 'a2'), subjectTag('prop', 'D', 'd1')]),
        ]),
      ],
    });

    expect(r.mixes).toHaveLength(2);

    const g1 = r.mixes.find((m) => m.keys.includes('A/a1'));
    const g2 = r.mixes.find((m) => m.keys.includes('A/a2'));
    expect(g1).toBeDefined();
    expect(g2).toBeDefined();

    // Both groups carry the FULL enabled cast (even members absent from a crop).
    expect(g1!.keys).toEqual(['A/a1', 'B/b1', 'C/c1', 'D/d1']);
    expect(g2!.keys).toEqual(['A/a2', 'B/b1', 'C/c1', 'D/d1']);

    // (a1,b1),(b1,c1),(b1,c1,d1) → group1 ; (a2,c1),(a2,d1) → group2
    expect(g1!.crop_sheets[0].crops).toHaveLength(3);
    expect(g2!.crop_sheets[0].crops).toHaveLength(2);

    // Name disambiguates the multi-variant entity, leaves single-variant clean.
    expect(g1!.name).toBe('Aria (a1) & Bee & Cleo & Drum');
    expect(g2!.name).toBe('Aria (a2) & Bee & Cleo & Drum');
  });
});

// ── Reshape 2026-05-20/21: base_image_url → variant.visual_swap_url + name ────

/** Character carrying a base variant (type=0) so visual_swap_url can be copied. */
function makeCharWithBaseVariant(key: string, name: string): Character {
  return {
    order: 0,
    key,
    name,
    basic_info: {},
    personality: {},
    variants: [
      {
        name: 'base',
        key: `${key}_v0`,
        type: 0,
        appearance: {},
        visual_description: '',
        illustrations: [],
        image_references: [],
      },
    ],
    voice_setting: null,
    crop_sheets: [],
  } as unknown as Character;
}

function makeReshapedConfig(baseImageUrl: string | null): RemixConfig {
  return {
    characters: [
      {
        key: 'c1',
        human_id: 'h1',
        visual: 'vp1',
        traits: [],
        base_image_url: baseImageUrl,
        is_enabled: true,
      },
    ],
    props: [],
    voices: [],
    languages: [],
  };
}

describe('buildRemixClonePayload — base_image_url copy + default name', () => {
  it('copies config.characters[].base_image_url onto base variant visual_swap_url', () => {
    const r = buildRemixClonePayload(
      {
        snapshotId: 'snap-1',
        illustration: makeIllustration([]),
        characters: [makeCharWithBaseVariant('c1', 'Miu')],
        props: [],
      },
      makeReshapedConfig('https://swap/c1.png'),
      'My Remix',
    );
    const base = r.characters[0].variants.find((v) => v.type === 0);
    expect(base?.visual_swap_url).toBe('https://swap/c1.png');
    expect(r.name).toBe('My Remix');
  });

  it('leaves visual_swap_url unset when base_image_url is null', () => {
    const r = buildRemixClonePayload(
      {
        snapshotId: 'snap-1',
        illustration: makeIllustration([]),
        characters: [makeCharWithBaseVariant('c1', 'Miu')],
        props: [],
      },
      makeReshapedConfig(null),
    );
    const base = r.characters[0].variants.find((v) => v.type === 0);
    expect(base?.visual_swap_url).toBeUndefined();
  });

  it("defaults the name to 'New Remix' when none is provided", () => {
    const r = buildRemixClonePayload(
      {
        snapshotId: 'snap-1',
        illustration: makeIllustration([]),
        characters: [makeCharWithBaseVariant('c1', 'Miu')],
        props: [],
      },
      makeReshapedConfig(null),
    );
    expect(r.name).toBe('New Remix');
  });
});
