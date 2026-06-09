// apply-sprite-finals.test.ts — Pure sprite-swap finalize helpers.

import { describe, it, expect } from 'vitest';
import type {
  Remix,
  RemixSpriteEntry,
  SwapResultSpriteCrop,
} from '@/types/remix';
import {
  resolveSpriteFinals,
  applySpriteFinalsToVariants,
} from './apply-sprite-finals';

function swapCrop(
  objectKey: string,
  variantKey: string,
  url: string,
  isFinal?: boolean,
): SwapResultSpriteCrop {
  const c: SwapResultSpriteCrop = {
    type: 'character',
    object_key: objectKey,
    variant_key: variantKey,
    geometry: { x: 0, y: 0, w: 10, h: 10 },
    media_url: url,
  };
  if (isFinal !== undefined) c.is_final = isFinal;
  return c;
}

function sprite(
  id: string,
  order: number,
  crops: SwapResultSpriteCrop[],
  isSelected = true,
): RemixSpriteEntry {
  return {
    id,
    order,
    name: `Sprite ${order}`,
    crop_sheets: [
      {
        title: 'sheet 1',
        sheet_geometry: { width: 100, height: 100 },
        image_url: '',
        crops: [],
        swap_results: [
          { media_url: 'u', created_time: '', is_selected: isSelected, crops },
        ],
      },
    ],
  };
}

function makeRemix(sprites: RemixSpriteEntry[], characters: Remix['characters'] = []): Remix {
  return {
    id: 'r1',
    snapshot_id: 's1',
    name: 'R',
    remix_config: { characters: [], props: [], voices: [], languages: [] },
    illustration: { spreads: [], sections: [] },
    characters,
    props: [],
    mixes: [],
    sprites,
    created_at: '',
    updated_at: '',
  };
}

// ── resolveSpriteFinals ──────────────────────────────────────────────────────

describe('resolveSpriteFinals', () => {
  it('empty when no is_final', () => {
    expect(resolveSpriteFinals(makeRemix([sprite('s1', 0, [swapCrop('c', 'v', 'u')])]))).toEqual([]);
  });

  it('picks is_final crops, one per cell', () => {
    const finals = resolveSpriteFinals(
      makeRemix([sprite('s1', 0, [swapCrop('c', 'v1', 'u1', true), swapCrop('c', 'v2', 'u2', true)])]),
    );
    expect(finals).toHaveLength(2);
    expect(finals.find((f) => f.variant_key === 'v1')?.media_url).toBe('u1');
  });

  it('ignores is_final on a non-selected swap_result', () => {
    expect(
      resolveSpriteFinals(makeRemix([sprite('s1', 0, [swapCrop('c', 'v', 'u', true)], false)])),
    ).toEqual([]);
  });

  it('cross-sprite mutex: highest sprite.order wins on duplicate final', () => {
    const finals = resolveSpriteFinals(
      makeRemix([
        sprite('s1', 0, [swapCrop('c', 'v', 'low', true)]),
        sprite('s2', 1, [swapCrop('c', 'v', 'high', true)]),
      ]),
    );
    expect(finals).toHaveLength(1);
    expect(finals[0].media_url).toBe('high');
    expect(finals[0].sprite_id).toBe('s2');
  });
});

// ── applySpriteFinalsToVariants ──────────────────────────────────────────────

function charEntity(key: string, variantKeys: string[]) {
  return {
    order: 0,
    name: key,
    key,
    basic_info: {} as never,
    personality: {} as never,
    variants: variantKeys.map((vk) => ({
      name: vk,
      key: vk,
      type: 1 as const,
      appearance: {} as never,
      visual_description: '',
      illustrations: [],
      image_references: [],
      visual_swap_url: null,
    })),
    voice_setting: null,
  };
}

describe('applySpriteFinalsToVariants', () => {
  it('writes visual_swap_url onto the matching variant', () => {
    const remix = makeRemix([], [charEntity('c', ['v1', 'v2'])] as never);
    const { characters, appliedCount } = applySpriteFinalsToVariants(remix, [
      { type: 'character', object_key: 'c', variant_key: 'v1', media_url: 'swapped', sprite_id: 's1' },
    ]);
    expect(appliedCount).toBe(1);
    const c = characters.find((x) => x.key === 'c')!;
    expect(c.variants.find((v) => v.key === 'v1')?.visual_swap_url).toBe('swapped');
    expect(c.variants.find((v) => v.key === 'v2')?.visual_swap_url).toBeNull();
  });

  it('idempotent — no change counted when url already set', () => {
    const remix = makeRemix([], [charEntity('c', ['v1'])] as never);
    const finals = [
      { type: 'character' as const, object_key: 'c', variant_key: 'v1', media_url: 'x', sprite_id: 's1' },
    ];
    const first = applySpriteFinalsToVariants(remix, finals);
    expect(first.appliedCount).toBe(1);
    const second = applySpriteFinalsToVariants(
      { ...remix, characters: first.characters },
      finals,
    );
    expect(second.appliedCount).toBe(0);
  });
});
