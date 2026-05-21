// config-constants.test.ts — Unit tests for book.remix normalization helpers.
// Covers the 2026-05-21 reshape (narrator singular → voices[]) + unified trait
// order. Key regression guards:
//   - normalizeBookRemix MUST drop legacy `narrator` and NOT seed voices[]
//     (Validation S1 decision; remix not in production). This test exists so a
//     future change cannot silently re-introduce narrator→voices seeding.
//   - normalizeRemixTraits MUST always emit the 5 canonical entries in order,
//     filling missing ones with is_enabled: true.

import { describe, it, expect } from 'vitest';
import { normalizeBookRemix, normalizeRemixTraits } from './config-constants';
import { TRAIT_TYPES } from './trait-constants';

describe('normalizeBookRemix', () => {
  it('returns null for null/undefined raw (preserves "not configured" state)', () => {
    expect(normalizeBookRemix(null)).toBeNull();
    expect(normalizeBookRemix(undefined)).toBeNull();
  });

  it('returns null for non-object raw', () => {
    expect(normalizeBookRemix('garbage')).toBeNull();
    expect(normalizeBookRemix(42)).toBeNull();
  });

  it('coerces missing arrays to empty (full shape contract)', () => {
    const result = normalizeBookRemix({});
    expect(result).toEqual({ languages: [], voices: [], characters: [], props: [] });
  });

  it('drops legacy narrator singular and does NOT seed voices[]', () => {
    // Legacy book had narrator enabled — must NOT carry over into voices[].
    const result = normalizeBookRemix({ narrator: { is_enabled: true } });
    expect(result).not.toBeNull();
    expect(result!.voices).toEqual([]);
    // No 'narrator' key leaks into the normalized shape.
    expect(result as unknown as Record<string, unknown>).not.toHaveProperty('narrator');
  });

  it('preserves an explicit voices[] collection', () => {
    const voices = [
      { key: 'narrator', name: 'Narrator', is_enabled: true },
      { key: 'elara', name: 'Elara', is_enabled: false },
    ];
    const result = normalizeBookRemix({ voices });
    expect(result!.voices).toEqual(voices);
  });

  it('normalizes each character traits[] to the 5 canonical entries', () => {
    const result = normalizeBookRemix({
      characters: [{ key: 'elara', name: 'Elara', is_enabled: true, traits: [] }],
    });
    const traits = result!.characters[0].traits;
    expect(traits.map((t) => t.type)).toEqual(TRAIT_TYPES);
    expect(traits.every((t) => t.is_enabled === true)).toBe(true);
  });
});

describe('normalizeRemixTraits', () => {
  it('fills all 5 canonical traits when undefined', () => {
    const traits = normalizeRemixTraits(undefined);
    expect(traits.map((t) => t.type)).toEqual(TRAIT_TYPES);
    expect(traits.every((t) => t.is_enabled)).toBe(true);
  });

  it('preserves existing is_enabled and re-orders to canonical', () => {
    const traits = normalizeRemixTraits([
      { type: 'outfit', is_enabled: false },
      { type: 'face', is_enabled: false },
    ]);
    expect(traits.map((t) => t.type)).toEqual(TRAIT_TYPES); // canonical order
    expect(traits.find((t) => t.type === 'outfit')!.is_enabled).toBe(false);
    expect(traits.find((t) => t.type === 'face')!.is_enabled).toBe(false);
    // Missing entries default to true.
    expect(traits.find((t) => t.type === 'hair')!.is_enabled).toBe(true);
  });
});
