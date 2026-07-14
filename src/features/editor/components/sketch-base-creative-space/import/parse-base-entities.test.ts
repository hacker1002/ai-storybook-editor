import { describe, it, expect } from 'vitest';
import { parseWorkbook, parseBaseEntities, normalizeRow, validateBaseImport, type BaseSheetRow, type ImportIssues } from './parse-base-entities';

// Import XLSX for building test fixtures
import * as XLSX from 'xlsx';

describe('normalizeRow', () => {
  it('lowercases+trims keys and coerces values to trimmed strings', () => {
    const row = normalizeRow({ ' Character ': '  hero ', Variant: 'base', Height: ' tall ' });
    expect(row).toEqual({ character: 'hero', variant: 'base', height: 'tall' });
  });

  it('coerces null/undefined cells to empty string', () => {
    expect(normalizeRow({ character: null, variant: undefined, height: '' })).toEqual({
      character: '',
      variant: '',
      height: '',
    });
  });

  it('coerces numeric cell values to strings', () => {
    const row = normalizeRow({ character: 'hero', number: 123 });
    expect(row.number).toBe('123');
  });
});

describe('parseBaseEntities', () => {
  const rows: BaseSheetRow[] = [
    { character: 'hero', variant: 'base', description: 'a warrior', height: 'tall', visual_design: 'mighty', art_language: 'epic' },
    { character: 'hero', variant: 'wounded', description: '', height: '', visual_design: 'hurt', art_language: '' },
    { character: 'villain', variant: 'base', description: '', height: 'short', visual_design: 'evil', art_language: 'dark' },
    { character: '', variant: 'ghost', description: 'no key', height: '', visual_design: '', art_language: '' },
  ];

  it('groups rows by key column, first-seen order, one variant per row', () => {
    const entities = parseBaseEntities(rows, 'character');
    expect(entities.map((e) => e.key)).toEqual(['hero', 'villain']);
    expect(entities[0].variants).toHaveLength(2);
    expect(entities[0].variants[0]).toMatchObject({ key: 'base', visual_design: 'mighty' });
    expect(entities[0].variants[1]).toMatchObject({ key: 'wounded', visual_design: 'hurt' });
  });

  it('maps 4 columns to their own variant fields (description ≠ visual_design)', () => {
    const entities = parseBaseEntities(rows, 'character');
    const heroBase = entities[0].variants[0];
    expect(heroBase.description).toBe('a warrior');
    expect(heroBase.height).toBe('tall');
    expect(heroBase.visual_design).toBe('mighty');
    expect(heroBase.art_language).toBe('epic');
  });

  it('coerces missing text fields to empty string', () => {
    const entities = parseBaseEntities(rows, 'character');
    const heroWounded = entities[0].variants[1];
    expect(heroWounded.description).toBe('');
    expect(heroWounded.height).toBe('');
    expect(heroWounded.art_language).toBe('');
  });

  it('skips rows with empty key column', () => {
    const entities = parseBaseEntities(rows, 'character');
    expect(entities.length).toBe(2); // hero + villain, ghost row skipped
  });

  it('returns [] for empty rows', () => {
    expect(parseBaseEntities([], 'character')).toEqual([]);
  });
});

describe('parseWorkbook (integration with XLSX)', () => {
  function buildTestWorkbook(): ArrayBuffer {
    // Create a minimal 2-sheet workbook: Characters + Props
    // Headers must match COL constants exactly (will be lowercased by normalizeRow)
    const charRows = [
      ['Character', 'Variant', 'Description', 'Height', 'Visual_Design', 'Art_Language'],
      ['hero', 'base', 'a warrior', 'tall', 'mighty', 'epic'],
      ['hero', 'wounded', '', '', 'hurt', ''],
      ['villain', 'base', '', 'short', 'evil', 'dark'],
    ];
    const propRows = [
      ['Prop', 'Variant', 'Description', 'Height', 'Visual_Design', 'Art_Language'],
      ['sword', 'base', 'a blade', '', 'sharp', 'combat'],
      ['shield', 'base', '', 'large', 'protective', 'defense'],
    ];

    const wsChar = XLSX.utils.aoa_to_sheet(charRows);
    const wsProp = XLSX.utils.aoa_to_sheet(propRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsChar, 'Characters');
    XLSX.utils.book_append_sheet(wb, wsProp, 'Props');

    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  }

  it('parses 2-sheet workbook → characters + props with 4 fields each', () => {
    const buffer = buildTestWorkbook();
    const parsed = parseWorkbook(buffer, XLSX);

    expect(parsed.result.characters).toHaveLength(2); // hero, villain
    expect(parsed.result.props).toHaveLength(2); // sword, shield

    const heroBase = parsed.result.characters[0].variants[0];
    expect(heroBase).toMatchObject({
      key: 'base',
      description: 'a warrior',
      height: 'tall',
      visual_design: 'mighty',
      art_language: 'epic',
    });

    const swordBase = parsed.result.props[0].variants[0];
    expect(swordBase).toMatchObject({
      key: 'base',
      description: 'a blade',
      height: '',
      visual_design: 'sharp',
      art_language: 'combat',
    });

    expect(parsed.issues.errors).toHaveLength(0);
  });

  it('empty cell → empty string', () => {
    const buffer = buildTestWorkbook();
    const parsed = parseWorkbook(buffer, XLSX);

    const heroWounded = parsed.result.characters[0].variants[1];
    expect(heroWounded.description).toBe('');
    expect(heroWounded.height).toBe('');
    expect(heroWounded.art_language).toBe('');
  });

  it('missing Props sheet → error in issues', () => {
    // Build workbook with only Characters sheet
    const charRows = [
      ['Character', 'Variant', 'Description', 'Height', 'Visual_Design', 'Art_Language'],
      ['hero', 'base', 'a warrior', 'tall', 'mighty', 'epic'],
    ];
    const wsChar = XLSX.utils.aoa_to_sheet(charRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsChar, 'Characters');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const parsed = parseWorkbook(buffer, XLSX);

    expect(parsed.issues.errors.length).toBeGreaterThan(0);
    expect((parsed.issues.errors as string[]).some((e) => e.includes('Props'))).toBe(true);
  });

  it('missing required column (Variant) → error', () => {
    // Build workbook missing the Variant column
    const charRows = [
      ['Character', 'Description', 'Height', 'Visual_Design'], // no Variant
      ['hero', 'a warrior', 'tall', 'mighty'],
    ];
    const propRows = [
      ['Prop', 'Description', 'Height', 'Visual_Design'],
      ['sword', 'a blade', '', 'sharp'],
    ];

    const wsChar = XLSX.utils.aoa_to_sheet(charRows);
    const wsProp = XLSX.utils.aoa_to_sheet(propRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsChar, 'Characters');
    XLSX.utils.book_append_sheet(wb, wsProp, 'Props');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    const parsed = parseWorkbook(buffer, XLSX);

    expect(parsed.issues.errors.length).toBeGreaterThan(0);
    expect((parsed.issues.errors as string[]).some((e) => e.includes('variant'))).toBe(true);
  });
});

describe('validateBaseImport', () => {
  it('flags duplicate variant key within an entity as error', () => {
    const rows: BaseSheetRow[] = [
      { character: 'hero', variant: 'base', description: 'v1', height: '', visual_design: '', art_language: '' },
      { character: 'hero', variant: 'base', description: 'v2', height: '', visual_design: '', art_language: '' },
    ];
    const entities = parseBaseEntities(rows, 'character');
    const issues: ImportIssues = { errors: [], warnings: [] };

    validateBaseImport(entities, rows, 'characters', 'character', new Map(), issues);

    expect((issues.errors as string[]).some((e) => e.includes('trùng'))).toBe(true);
  });

  it('warns when there is not exactly one base variant', () => {
    const rows: BaseSheetRow[] = [
      { character: 'hero', variant: 'wounded', description: '', height: '', visual_design: '', art_language: '' },
    ];
    const entities = parseBaseEntities(rows, 'character');
    const issues: ImportIssues = { errors: [], warnings: [] };

    validateBaseImport(entities, rows, 'characters', 'character', new Map(), issues);

    expect((issues.warnings as string[]).some((w) => w.includes('base'))).toBe(true);
  });

  it('warns on inline @ref that does not resolve', () => {
    const rows: BaseSheetRow[] = [
      { character: 'hero', variant: 'base', description: 'next to @unknown/base', height: '', visual_design: '', art_language: '' },
    ];
    const entities = parseBaseEntities(rows, 'character');
    const issues = { errors: [], warnings: [] };
    const knownKeys = new Map(); // empty = no known entities

    validateBaseImport(entities, rows, 'characters', 'character', knownKeys, issues);

    expect((issues.warnings as string[]).some((w) => w.includes('@unknown/base'))).toBe(true);
  });

  it('does NOT warn on inline @ref that resolves within the same kind', () => {
    const rows: BaseSheetRow[] = [
      { character: 'hero', variant: 'base', description: 'plain', height: '', visual_design: '', art_language: '' },
      { character: 'hero', variant: 'wounded', description: 'like @hero/base but hurt', height: '', visual_design: '', art_language: '' },
    ];
    const entities = parseBaseEntities(rows, 'character');
    const issues = { errors: [], warnings: [] };
    const knownKeys = new Map([['hero', entities[0]]]);

    validateBaseImport(entities, rows, 'characters', 'character', knownKeys, issues);

    expect((issues.warnings as string[]).some((w) => w.includes('@hero/base'))).toBe(false);
  });
});
