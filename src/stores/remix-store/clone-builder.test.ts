// clone-builder.test.ts — Unit tests for buildRemixClonePayload pure transform.
// rev2 (batch model, Phase 03): crops live on the batch now (entities no longer
// carry `crop_sheets`), and exactly ONE empty batch skeleton is
// produced (`makeBatchSkeleton(0,'Batch 1')`). The crop population +
// single-subject/mix enumeration that the legacy builder did is gone — crops
// are filled by `computeCropSheets` (layout engine over `groupCropsForBatch`)
// in the same INSERT path, NOT by this pure builder.

import { describe, it, expect } from 'vitest';
import { buildRemixClonePayload, makeBatchSkeleton } from './clone-builder';
import type { CloneBuilderInput } from './clone-builder';
import type { RemixConfig } from '@/types/remix';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import type { IllustrationData } from '@/types/illustration-types';

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeChar(key: string, name: string): Character {
  return {
    key,
    name,
    description: '',
    variants: [],
  } as unknown as Character;
}

function makeProp(key: string, name: string): Prop {
  return {
    key,
    name,
    description: '',
    variants: [],
    sounds: [],
  } as unknown as Prop;
}

function makeIllustration(): IllustrationData {
  return { spreads: [], sections: [] } as unknown as IllustrationData;
}

interface BuildOpts {
  characters?: Character[];
  props?: Prop[];
  enabledCharKeys?: string[];
  enabledPropKeys?: string[];
  name?: string;
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
    illustration: makeIllustration(),
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

  return buildRemixClonePayload(input, config, opts.name ?? 'Test Remix');
}

// ── makeBatchSkeleton ─────────────────────────────────────────────────────────

describe('makeBatchSkeleton', () => {
  it('builds an empty batch with a uuid id, the given order/name, empty crop_sheets', () => {
    const b = makeBatchSkeleton(0, 'Batch 1');
    expect(b.order).toBe(0);
    expect(b.name).toBe('Batch 1');
    expect(b.crop_sheets).toEqual([]);
    expect(typeof b.id).toBe('string');
    expect(b.id.length).toBeGreaterThan(0);
    // rev2: no legacy `keys[]` lineup on the batch.
    expect((b as unknown as { keys?: unknown }).keys).toBeUndefined();
  });

  it('mints a distinct id per call', () => {
    expect(makeBatchSkeleton(0, 'a').id).not.toBe(makeBatchSkeleton(0, 'b').id);
  });
});

// ── buildRemixClonePayload (rev2 batch model) ─────────────────────────────────

describe('buildRemixClonePayload — rev2 batch model', () => {
  it('produces exactly one empty batch skeleton (entities carry no crops)', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu')],
      props: [makeProp('p1', 'Sword')],
    });
    expect(r.mixes).toHaveLength(1);
    expect(r.mixes[0].order).toBe(0);
    expect(r.mixes[0].name).toBe('Batch 1');
    expect(r.mixes[0].crop_sheets).toEqual([]);
    expect(typeof r.mixes[0].id).toBe('string');
  });

  it('clones enabled entities (crops live on the batch, not the entity)', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu')],
      props: [makeProp('p1', 'Sword')],
    });
    expect(r.characters).toHaveLength(1);
    expect(r.characters[0].key).toBe('c1');
    expect(r.props).toHaveLength(1);
    expect(r.props[0].key).toBe('p1');
  });

  it('excludes config-disabled char/prop keys from the payload', () => {
    const r = build({
      characters: [makeChar('c1', 'Miu'), makeChar('c2', 'Lulu')],
      props: [makeProp('p1', 'Sword')],
      enabledCharKeys: ['c1'],
      enabledPropKeys: [],
    });
    expect(r.characters.map((c) => c.key)).toEqual(['c1']);
    expect(r.props).toHaveLength(0);
    // Still exactly one batch even with no crops anywhere.
    expect(r.mixes).toHaveLength(1);
  });

  it('passes through snapshot_id + remix_config + cloned illustration', () => {
    const r = build({ characters: [makeChar('c1', 'Miu')] });
    expect(r.snapshot_id).toBe('snap-1');
    expect(r.remix_config).toBeDefined();
    expect(r.illustration).toBeDefined();
    expect(r.illustration.spreads).toEqual([]);
  });
});

// ── base variant (no visual_swap_url seed) + default name ─────────────────────

/** Character carrying a base variant (type=0). */
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
  } as unknown as RemixConfig;
}

describe('buildRemixClonePayload — base variant (no seed) + default name', () => {
  it('does NOT seed visual_swap_url onto the base variant (dead column; derived from sprite finals)', () => {
    const r = buildRemixClonePayload(
      {
        snapshotId: 'snap-1',
        illustration: makeIllustration(),
        characters: [makeCharWithBaseVariant('c1', 'Miu')],
        props: [],
      },
      makeReshapedConfig('https://swap/c1.png'),
      'My Remix',
    );
    const base = r.characters[0].variants.find((v) => v.type === 0);
    expect(base?.visual_swap_url).toBeUndefined();
    expect(r.name).toBe('My Remix');
  });

  it("defaults the name to 'New Remix' when none is provided", () => {
    const r = buildRemixClonePayload(
      {
        snapshotId: 'snap-1',
        illustration: makeIllustration(),
        characters: [makeCharWithBaseVariant('c1', 'Miu')],
        props: [],
      },
      makeReshapedConfig(null),
    );
    expect(r.name).toBe('New Remix');
  });
});
