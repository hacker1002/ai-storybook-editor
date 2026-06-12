// batch-swap-gating.test.ts — Unit tests for the pure Batches-tab swap
// precondition resolver. Asserts: only ENABLED CHARACTER tokens missing a
// visual_swap_url gate the swap; props + disabled/unknown subjects are excluded.

import { describe, it, expect } from 'vitest';
import {
  isEnabledCharacterToken,
  resolveVisualSwapUrl,
  missingCharRefs,
} from './batch-swap-gating';
import type { RemixBatch, RemixVariantEntity, CropEntry } from '@/types/remix';
import type { SpreadTag } from '@/types/spread-types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function charEntity(
  key: string,
  variants: { key: string; visualSwapUrl: string | null }[],
): RemixVariantEntity {
  return {
    type: 'character',
    key,
    name: key,
    variants: variants.map((v) => ({
      variantKey: v.key,
      name: v.key,
      illustrationUrl: null,
      visualSwapUrl: v.visualSwapUrl,
      isBase: v.key === 'base',
    })),
  };
}

function propEntity(key: string, variants: { key: string; visualSwapUrl: string | null }[]): RemixVariantEntity {
  return { ...charEntity(key, variants), type: 'prop' };
}

function tag(type: 'character' | 'prop', objectKey: string, variantKey: string): SpreadTag {
  return { type, object_key: objectKey, variant_key: variantKey } as SpreadTag;
}

function crop(tags: SpreadTag[]): CropEntry {
  // LEAN CropEntry (⚡2026-06-12) — 5 fields only.
  return {
    spread_id: 's1',
    id: `i-${tags.map((t) => t.object_key).join('-')}`,
    tags,
    media_url: 'https://cdn/x.png',
    geometry: { x: 0, y: 0, w: 10, h: 10 },
  };
}

function batch(crops: CropEntry[]): RemixBatch {
  return {
    id: 'b1',
    order: 0,
    name: 'Batch 1',
    crop_sheets: [
      { title: 'sheet 1', sheet_geometry: { width: 100, height: 100 }, image_url: '', swap_results: [], original_crops: crops },
    ],
    swapTask: { state: 'idle' },
  };
}

// ── isEnabledCharacterToken ───────────────────────────────────────────────────

describe('isEnabledCharacterToken', () => {
  const entities = [charEntity('c1', [{ key: 'v1', visualSwapUrl: null }]), propEntity('p1', [{ key: 'v1', visualSwapUrl: null }])];

  it('true for an enabled character token', () => {
    expect(isEnabledCharacterToken('c1/v1', entities)).toBe(true);
  });
  it('false for a prop token', () => {
    expect(isEnabledCharacterToken('p1/v1', entities)).toBe(false);
  });
  it('false for an unknown / disabled object', () => {
    expect(isEnabledCharacterToken('ghost/v1', entities)).toBe(false);
  });
  it('false for a malformed token (no slash)', () => {
    expect(isEnabledCharacterToken('c1', entities)).toBe(false);
  });
});

// ── resolveVisualSwapUrl ──────────────────────────────────────────────────────

describe('resolveVisualSwapUrl', () => {
  const entities = [charEntity('c1', [
    { key: 'v1', visualSwapUrl: 'https://cdn/c1-v1.png' },
    { key: 'v2', visualSwapUrl: null },
  ])];

  it('returns the persisted visual_swap_url for a generated variant', () => {
    expect(resolveVisualSwapUrl('c1/v1', entities)).toBe('https://cdn/c1-v1.png');
  });
  it('returns null for an ungenerated variant', () => {
    expect(resolveVisualSwapUrl('c1/v2', entities)).toBeNull();
  });
  it('returns null for an unknown entity/variant', () => {
    expect(resolveVisualSwapUrl('c1/nope', entities)).toBeNull();
    expect(resolveVisualSwapUrl('zzz/v1', entities)).toBeNull();
  });
});

// ── missingCharRefs ───────────────────────────────────────────────────────────

describe('missingCharRefs', () => {
  it('lists ONLY enabled characters whose variant lacks a visual_swap_url', () => {
    const entities = [
      charEntity('c1', [{ key: 'v1', visualSwapUrl: 'https://cdn/c1.png' }]), // generated
      charEntity('c2', [{ key: 'v1', visualSwapUrl: null }]),                  // missing
    ];
    const b = batch([crop([tag('character', 'c1', 'v1'), tag('character', 'c2', 'v1')])]);
    expect(missingCharRefs(b, entities)).toEqual(['c2/v1']);
  });

  it('empty when every enabled character has a visual', () => {
    const entities = [charEntity('c1', [{ key: 'v1', visualSwapUrl: 'https://cdn/c1.png' }])];
    const b = batch([crop([tag('character', 'c1', 'v1')])]);
    expect(missingCharRefs(b, entities)).toEqual([]);
  });

  it('excludes props from the precondition even when they have no visual', () => {
    const entities = [
      charEntity('c1', [{ key: 'v1', visualSwapUrl: 'https://cdn/c1.png' }]),
      propEntity('p1', [{ key: 'v1', visualSwapUrl: null }]),
    ];
    const b = batch([crop([tag('character', 'c1', 'v1'), tag('prop', 'p1', 'v1')])]);
    // p1 lacks a visual but is a prop → does NOT gate.
    expect(missingCharRefs(b, entities)).toEqual([]);
  });

  it('excludes disabled/unknown subjects (not in the projection)', () => {
    const entities = [charEntity('c1', [{ key: 'v1', visualSwapUrl: 'https://cdn/c1.png' }])];
    // ghost is not an enabled entity → excluded even though it has no visual.
    const b = batch([crop([tag('character', 'c1', 'v1'), tag('character', 'ghost', 'v1')])]);
    expect(missingCharRefs(b, entities)).toEqual([]);
  });
});
