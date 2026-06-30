import { describe, it, expect } from 'vitest';
import {
  normalizeRow,
  parseEntities,
  validateSketchImport,
  type SketchSheetRow,
} from './parse-sketch-entities';

// Header-keyed rows as `sheet_to_json` would emit them (pre-normalization keys may be
// mixed-case / spaced). Core logic runs on already-extracted rows → no SheetJS needed.

describe('normalizeRow', () => {
  it('lowercases+trims keys and coerces values to trimmed strings', () => {
    const row = normalizeRow({ ' Character ': '  kid ', Variant: 'base', Description: ' hi ', Num: 3 });
    expect(row).toEqual({ character: 'kid', variant: 'base', description: 'hi', num: '3' });
  });

  it('coerces null/undefined cells to empty string', () => {
    expect(normalizeRow({ character: null, variant: undefined })).toEqual({ character: '', variant: '' });
  });
});

describe('parseEntities', () => {
  const rows: SketchSheetRow[] = [
    { character: 'kid', variant: 'base', description: 'a small child' },
    { character: 'kid', variant: 'hero', description: '@kid/base wearing a cape' },
    { character: 'mom', variant: 'base', description: 'the mother' },
    { character: '', variant: 'ghost', description: 'skipped (no key)' },
  ];

  it('groups rows by key column, first-seen order, one variant per row', () => {
    const entities = parseEntities(rows, 'character');
    expect(entities.map((e) => e.key)).toEqual(['kid', 'mom']);
    expect(entities[0].variants).toEqual([
      { key: 'base', visual_description: 'a small child' },
      { key: 'hero', visual_description: '@kid/base wearing a cape' },
    ]);
    expect(entities[0].media_url).toBeNull();
  });

  it('skips rows with an empty key column', () => {
    expect(parseEntities(rows, 'character')).toHaveLength(2);
  });

  it('returns [] for no rows', () => {
    expect(parseEntities([], 'prop')).toEqual([]);
  });
});

describe('validateSketchImport', () => {
  it('flags zero entities as a blocking error', () => {
    const { errors } = validateSketchImport([], [], 'characters');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('characters');
  });

  it('errors on duplicate variant key within an entity', () => {
    const rows: SketchSheetRow[] = [
      { character: 'kid', variant: 'base', description: 'x' },
      { character: 'kid', variant: 'base', description: 'y' },
    ];
    const entities = parseEntities(rows, 'character');
    const { errors } = validateSketchImport(entities, rows, 'characters');
    expect(errors.some((e) => e.includes('trùng'))).toBe(true);
  });

  it('warns (not errors) when there is not exactly one base', () => {
    const rows: SketchSheetRow[] = [{ character: 'kid', variant: 'hero', description: 'x' }];
    const entities = parseEntities(rows, 'character');
    const { errors, warnings } = validateSketchImport(entities, rows, 'characters');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('base'))).toBe(true);
  });

  it('warns on an in-description @ref to an unknown key (kept verbatim)', () => {
    const rows: SketchSheetRow[] = [{ character: 'kid', variant: 'base', description: 'next to @dog/base' }];
    const entities = parseEntities(rows, 'character');
    const { warnings } = validateSketchImport(entities, rows, 'characters');
    expect(warnings.some((w) => w.includes('@dog/base'))).toBe(true);
  });

  it('does NOT warn on an in-description @ref that resolves within the same kind', () => {
    const rows: SketchSheetRow[] = [
      { character: 'kid', variant: 'base', description: 'plain' },
      { character: 'kid', variant: 'hero', description: 'like @kid/base but caped' },
    ];
    const entities = parseEntities(rows, 'character');
    const { warnings } = validateSketchImport(entities, rows, 'characters');
    expect(warnings.some((w) => w.includes('@kid/base'))).toBe(false);
  });

  it('resolves @ref case-insensitively (capitalized entity key, no spurious warning)', () => {
    const rows: SketchSheetRow[] = [
      { character: 'Kid', variant: 'base', description: 'plain' },
      { character: 'Kid', variant: 'hero', description: 'like @kid/BASE but caped' },
    ];
    const entities = parseEntities(rows, 'character');
    const { warnings } = validateSketchImport(entities, rows, 'characters');
    expect(warnings.some((w) => w.includes('@kid/BASE'))).toBe(false);
  });

  it('warns when the ref column does not match the row identity', () => {
    const rows: SketchSheetRow[] = [
      { character: 'kid', variant: 'base', description: 'x', ref: '@kid/wrong' },
    ];
    const entities = parseEntities(rows, 'character');
    const { warnings } = validateSketchImport(entities, rows, 'characters');
    expect(warnings.some((w) => w.includes('ref'))).toBe(true);
  });

  it('does NOT warn when the ref column matches the row identity', () => {
    const rows: SketchSheetRow[] = [
      { character: 'kid', variant: 'base', description: 'x', ref: '@kid/base' },
    ];
    const entities = parseEntities(rows, 'character');
    const { warnings } = validateSketchImport(entities, rows, 'characters');
    expect(warnings.some((w) => w.includes('cột ref'))).toBe(false);
  });
});
