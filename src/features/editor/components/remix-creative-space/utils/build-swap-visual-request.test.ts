// build-swap-visual-request.test.ts — Pure builder: resolve SwapVisualCoreRequest
// or a guard reason. Covers ok path (only enabled+described traits pass) + each
// guard (missing image / human / visual / converted_image / no usable trait).

import { describe, it, expect } from 'vitest';
import { buildSwapVisualCoreRequest } from './build-swap-visual-request';
import type { Human } from '@/types/human';
import type { Character } from '@/types/character-types';
import type { RemixCharacterChoice } from '@/types/remix';

function makeHuman(overrides: Partial<Human> = {}): Human {
  return {
    id: 'h1',
    sourceName: 'Human One',
    displayName: {},
    gender: null,
    country: null,
    description: 'a real person',
    visualProfiles: [
      {
        clientId: 'cp1',
        name: 'vp1',
        age: 20,
        type: 'face',
        rawImages: [],
        nobgImage: null,
        convertedImage: 'https://img/converted.png',
        traits: [
          { type: 'face', description: 'round face, hazel eyes', image_url: null },
          { type: 'hair', description: null, image_url: null }, // no desc → skipped
        ],
      },
    ],
    voiceProfiles: [],
    createdAt: '',
    ...overrides,
  };
}

const snapshotChars: Character[] = [
  {
    order: 0,
    key: 'c1',
    name: 'Miu',
    basic_info: { description: 'd', gender: 'f', age: '8', category_id: '', role: '' },
    personality: {} as never,
    variants: [
      {
        name: 'base',
        key: 'c1_v0',
        type: 0,
        appearance: { height: 1, hair: '', eyes: '', face: '', build: '' },
        visual_description: 'base visual',
        illustrations: [],
        image_references: [],
      },
    ],
    voice_setting: null,
    crop_sheets: [],
  } as unknown as Character,
];

function makeEntry(overrides: Partial<RemixCharacterChoice> = {}): RemixCharacterChoice {
  return {
    key: 'c1',
    human_id: 'h1',
    visual: 'vp1',
    traits: [
      { type: 'face', is_enabled: true },
      { type: 'hair', is_enabled: true },
      { type: 'skin', is_enabled: true }, // not in human profile → skipped
    ],
    base_image_url: null,
    is_enabled: true,
    ...overrides,
  };
}

const humans = { h1: makeHuman() };
const CHAR_IMG = 'https://img/char-base.png';

describe('buildSwapVisualCoreRequest — ok path', () => {
  it('resolves request with only enabled traits that have a description', () => {
    const r = buildSwapVisualCoreRequest('c1', makeEntry(), CHAR_IMG, humans, snapshotChars);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.character_image_url).toBe(CHAR_IMG);
    expect(r.request.human_image_url).toBe('https://img/converted.png');
    expect(r.request.human_description).toBe('a real person');
    // hair (null desc) + skin (absent) dropped → only face survives.
    expect(r.request.swap_traits).toEqual([{ type: 'face', description: 'round face, hazel eyes' }]);
    expect(r.request.character_context.name).toBe('Miu');
    expect(r.request.character_context.visual_description).toBe('base visual');
  });

  it('humanImageUrlOverride replaces human_image_url (non-base variant reuse)', () => {
    const r = buildSwapVisualCoreRequest(
      'c1',
      makeEntry(),
      CHAR_IMG,
      humans,
      snapshotChars,
      'https://img/base-swap.png',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Image #2 = base swap visual, NOT the human-normalize image.
    expect(r.request.human_image_url).toBe('https://img/base-swap.png');
    // swap_traits + human_description still sourced from the human profile.
    expect(r.request.human_description).toBe('a real person');
    expect(r.request.swap_traits).toEqual([{ type: 'face', description: 'round face, hazel eyes' }]);
  });

  it('still guards NO_CONVERTED_IMAGE even when override is provided', () => {
    const noConverted = {
      h1: makeHuman({
        visualProfiles: [{ ...makeHuman().visualProfiles[0], convertedImage: null }],
      }),
    };
    const r = buildSwapVisualCoreRequest(
      'c1',
      makeEntry(),
      CHAR_IMG,
      noConverted,
      snapshotChars,
      'https://img/base-swap.png',
    );
    expect(r).toEqual({ ok: false, reason: 'NO_CONVERTED_IMAGE' });
  });
});

describe('buildSwapVisualCoreRequest — guards', () => {
  it('NO_CHARACTER_IMAGE when characterImageUrl is null', () => {
    const r = buildSwapVisualCoreRequest('c1', makeEntry(), null, humans, snapshotChars);
    expect(r).toEqual({ ok: false, reason: 'NO_CHARACTER_IMAGE' });
  });

  it('NO_HUMAN when human_id missing or unknown', () => {
    expect(buildSwapVisualCoreRequest('c1', makeEntry({ human_id: null }), CHAR_IMG, humans, snapshotChars)).toEqual({
      ok: false,
      reason: 'NO_HUMAN',
    });
    expect(buildSwapVisualCoreRequest('c1', makeEntry({ human_id: 'ghost' }), CHAR_IMG, humans, snapshotChars)).toEqual({
      ok: false,
      reason: 'NO_HUMAN',
    });
  });

  it('NO_VISUAL when visual missing or not found on the human', () => {
    expect(buildSwapVisualCoreRequest('c1', makeEntry({ visual: null }), CHAR_IMG, humans, snapshotChars)).toEqual({
      ok: false,
      reason: 'NO_VISUAL',
    });
    expect(buildSwapVisualCoreRequest('c1', makeEntry({ visual: 'nope' }), CHAR_IMG, humans, snapshotChars)).toEqual({
      ok: false,
      reason: 'NO_VISUAL',
    });
  });

  it('NO_CONVERTED_IMAGE when the visual profile has no converted image', () => {
    const noConverted = {
      h1: makeHuman({
        visualProfiles: [{ ...makeHuman().visualProfiles[0], convertedImage: null }],
      }),
    };
    const r = buildSwapVisualCoreRequest('c1', makeEntry(), CHAR_IMG, noConverted, snapshotChars);
    expect(r).toEqual({ ok: false, reason: 'NO_CONVERTED_IMAGE' });
  });

  it('EMPTY_SWAP_TRAITS when no enabled trait has a description', () => {
    // Only hair enabled, but hair has null description → nothing to swap.
    const entry = makeEntry({ traits: [{ type: 'hair', is_enabled: true }] });
    const r = buildSwapVisualCoreRequest('c1', entry, CHAR_IMG, humans, snapshotChars);
    expect(r).toEqual({ ok: false, reason: 'EMPTY_SWAP_TRAITS' });
  });

  it('NO_SNAPSHOT_CHARACTER when the key is absent from the snapshot', () => {
    const r = buildSwapVisualCoreRequest('ghost', makeEntry({ key: 'ghost' }), CHAR_IMG, humans, snapshotChars);
    expect(r).toEqual({ ok: false, reason: 'NO_SNAPSHOT_CHARACTER' });
  });
});
