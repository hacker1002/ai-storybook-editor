// remix-config-normalize.test.ts — WYSIWYG trait normalization coverage
// (product call 2026-06-10): the persisted is_enabled must equal the DISPLAYED
// checkbox state (is_enabled ∧ bookGate ∧ profileSupported).

import { describe, it, expect } from 'vitest';
import {
  bookTraitGate,
  supportedTraitSetFor,
  maxTraitChoicesFor,
  normalizeRemixConfigTraits,
} from './remix-config-normalize';
import { TRAIT_TYPES } from '@/constants/trait-constants';
import type { Human, TraitType } from '@/types/human';
import type { RemixCharacterEntry } from '@/types/editor';
import type { RemixConfig, RemixCharacterChoice } from '@/types/remix';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Visual "vp1" supports face/hair/skin/outfit; facewear description blank/null. */
const human: Human = {
  id: 'human-1',
  sourceName: 'Đức',
  visualProfiles: [
    {
      clientId: 'c1',
      name: 'vp1',
      age: 30,
      type: 'full_body',
      rawImages: [],
      nobgImage: null,
      convertedImage: 'https://x/img.png',
      traits: [
        { type: 'face', description: 'round face', image_url: null },
        { type: 'facewear', description: '', image_url: null },
        { type: 'hair', description: 'short hair', image_url: null },
        { type: 'skin', description: 'tan', image_url: null },
        { type: 'outfit', description: 'blue suit', image_url: null },
      ],
    },
  ],
} as unknown as Human;

const bookChar: RemixCharacterEntry = {
  key: 'char_a',
  name: 'Character A',
  is_enabled: true,
  // Book gates outfit off; missing entries (face/facewear/hair) default enabled.
  traits: [
    { type: 'skin', is_enabled: true },
    { type: 'outfit', is_enabled: false },
  ],
};

function choice(overrides: Partial<RemixCharacterChoice>): RemixCharacterChoice {
  return {
    key: 'char_a',
    human_id: 'human-1',
    visual: 'vp1',
    traits: TRAIT_TYPES.map((type) => ({ type, is_enabled: true })),
    base_image_url: null,
    is_enabled: true,
    ...overrides,
  };
}

function configWith(characters: RemixCharacterChoice[]): RemixConfig {
  return {
    characters,
    props: [{ key: 'prop_a', prop_id: null, visual: null, is_enabled: true }],
    voices: [],
    languages: [],
  };
}

const enabledTypes = (cfg: RemixConfig, key: string): TraitType[] =>
  cfg.characters
    .find((c) => c.key === key)!
    .traits.filter((t) => t.is_enabled)
    .map((t) => t.type);

// ── bookTraitGate ────────────────────────────────────────────────────────────

describe('bookTraitGate', () => {
  it('reads the book gate; missing entries default to enabled', () => {
    expect(bookTraitGate(bookChar, 'outfit')).toBe(false);
    expect(bookTraitGate(bookChar, 'skin')).toBe(true);
    expect(bookTraitGate(bookChar, 'face')).toBe(true); // missing → enabled
  });

  it('undefined book character → all gates open', () => {
    expect(bookTraitGate(undefined, 'outfit')).toBe(true);
  });
});

// ── supportedTraitSetFor ─────────────────────────────────────────────────────

describe('supportedTraitSetFor', () => {
  it('returns traits with a non-empty description', () => {
    const set = supportedTraitSetFor([human], 'human-1', 'vp1')!;
    expect([...set].sort()).toEqual(['face', 'hair', 'outfit', 'skin']);
    expect(set.has('facewear')).toBe(false); // blank description
  });

  it('null when human/visual unset or unresolvable', () => {
    expect(supportedTraitSetFor([human], null, 'vp1')).toBeNull();
    expect(supportedTraitSetFor([human], 'human-1', null)).toBeNull();
    expect(supportedTraitSetFor([human], 'ghost', 'vp1')).toBeNull();
    expect(supportedTraitSetFor([human], 'human-1', 'ghost')).toBeNull();
  });
});

// ── maxTraitChoicesFor ───────────────────────────────────────────────────────

describe('maxTraitChoicesFor — default-max reset on human/visual change', () => {
  const enabledOf = (choices: ReturnType<typeof maxTraitChoicesFor>) =>
    choices.filter((t) => t.is_enabled).map((t) => t.type);

  it('with a resolved profile → bookGate ∧ supported', () => {
    const supported = supportedTraitSetFor([human], 'human-1', 'vp1');
    // facewear unsupported (blank description), outfit book-gated off.
    expect(enabledOf(maxTraitChoicesFor(bookChar, supported))).toEqual([
      'face',
      'hair',
      'skin',
    ]);
  });

  it('no profile (human change cascade) → book gate only', () => {
    expect(enabledOf(maxTraitChoicesFor(bookChar, null))).toEqual([
      'face',
      'facewear',
      'hair',
      'skin',
    ]);
  });

  it('always emits all 5 trait entries in canonical order', () => {
    expect(maxTraitChoicesFor(undefined, null).map((t) => t.type)).toEqual(
      TRAIT_TYPES,
    );
  });
});

// ── normalizeRemixConfigTraits ───────────────────────────────────────────────

describe('normalizeRemixConfigTraits — WYSIWYG', () => {
  it('drops profile-unsupported + book-gated traits even when raw is true', () => {
    const out = normalizeRemixConfigTraits(
      configWith([choice({})]),
      [bookChar],
      [human],
    );
    // facewear dropped (no profile description), outfit dropped (book gate).
    expect(enabledTypes(out, 'char_a')).toEqual(['face', 'hair', 'skin']);
  });

  it('keeps user-unchecked traits false', () => {
    const entry = choice({
      traits: TRAIT_TYPES.map((type) => ({ type, is_enabled: type === 'face' })),
    });
    const out = normalizeRemixConfigTraits(configWith([entry]), [bookChar], [human]);
    expect(enabledTypes(out, 'char_a')).toEqual(['face']);
  });

  it('no human/visual picked → only book gate applies (no profile masking)', () => {
    const entry = choice({ human_id: null, visual: null });
    const out = normalizeRemixConfigTraits(configWith([entry]), [bookChar], [human]);
    expect(enabledTypes(out, 'char_a')).toEqual(['face', 'facewear', 'hair', 'skin']);
  });

  it('missing trait entries persist as false (display parity, not reader default)', () => {
    const entry = choice({ traits: [{ type: 'face', is_enabled: true }] });
    const out = normalizeRemixConfigTraits(configWith([entry]), [bookChar], [human]);
    expect(enabledTypes(out, 'char_a')).toEqual(['face']);
    // Writer always emits all 5 in canonical order.
    expect(out.characters[0].traits.map((t) => t.type)).toEqual(TRAIT_TYPES);
  });

  it('character absent from book list → gates open, profile mask still applies', () => {
    const out = normalizeRemixConfigTraits(configWith([choice({})]), [], [human]);
    expect(enabledTypes(out, 'char_a')).toEqual(['face', 'hair', 'skin', 'outfit']);
  });

  it('props / voices / languages and non-trait character fields pass through', () => {
    const cfg = configWith([choice({})]);
    const out = normalizeRemixConfigTraits(cfg, [bookChar], [human]);
    expect(out.props).toEqual(cfg.props);
    expect(out.voices).toEqual(cfg.voices);
    expect(out.languages).toEqual(cfg.languages);
    const { traits: _t, ...rest } = out.characters[0];
    const { traits: _t2, ...origRest } = cfg.characters[0];
    expect(rest).toEqual(origRest);
  });

  it('does not mutate the input draft', () => {
    const cfg = configWith([choice({})]);
    const snapshot = JSON.parse(JSON.stringify(cfg));
    normalizeRemixConfigTraits(cfg, [bookChar], [human]);
    expect(cfg).toEqual(snapshot);
  });
});
