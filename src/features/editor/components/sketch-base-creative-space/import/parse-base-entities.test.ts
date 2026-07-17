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
    { character: 'hero', variant: 'base', description: 'a warrior', height: '1.1m', visual_design: 'mighty', art_language: 'epic' },
    { character: 'hero', variant: 'wounded', description: '', height: '', visual_design: 'hurt', art_language: '' },
    { character: 'villain', variant: 'base', description: '', height: '20-30cm', visual_design: 'evil', art_language: 'dark' },
    { character: 'ghostly', variant: 'base', description: '', height: 'tall', visual_design: '', art_language: '' },
    { character: '', variant: 'ghost', description: 'no key', height: '', visual_design: '', art_language: '' },
  ];

  it('groups rows by key column, first-seen order, one variant per row', () => {
    const entities = parseBaseEntities(rows, 'character');
    expect(entities.map((e) => e.key)).toEqual(['hero', 'villain', 'ghostly']);
    expect(entities[0].variants).toHaveLength(2);
    expect(entities[0].variants[0]).toMatchObject({ key: 'base', visual_design: 'mighty' });
    expect(entities[0].variants[1]).toMatchObject({ key: 'wounded', visual_design: 'hurt' });
  });

  it('maps 4 columns to their own variant fields (description ≠ visual_design)', () => {
    const entities = parseBaseEntities(rows, 'character');
    const heroBase = entities[0].variants[0];
    expect(heroBase.description).toBe('a warrior');
    expect(heroBase.height).toBe(110); // "1.1m" → cm number
    expect(heroBase.visual_design).toBe('mighty');
    expect(heroBase.art_language).toBe('epic');
  });

  it('height parses to a cm NUMBER — range takes the max', () => {
    const entities = parseBaseEntities(rows, 'character');
    expect(entities[1].variants[0].height).toBe(30); // villain "20-30cm" → max
  });

  it('height that is not measurable → null (variant still imported)', () => {
    const entities = parseBaseEntities(rows, 'character');
    const ghostly = entities[2];
    expect(ghostly.variants[0].height).toBeNull(); // "tall"
    expect(ghostly.variants).toHaveLength(1); // kept, not dropped
  });

  it('coerces missing text fields to empty string (height → null)', () => {
    const entities = parseBaseEntities(rows, 'character');
    const heroWounded = entities[0].variants[1];
    expect(heroWounded.description).toBe('');
    expect(heroWounded.height).toBeNull();
    expect(heroWounded.art_language).toBe('');
  });

  it('skips rows with empty key column', () => {
    const entities = parseBaseEntities(rows, 'character');
    expect(entities.length).toBe(3); // hero + villain + ghostly, keyless ghost row skipped
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
      ['hero', 'base', 'a warrior', '1.1m', 'mighty', 'epic'],
      ['hero', 'wounded', '', '', 'hurt', ''],
      ['villain', 'base', '', '110cm', 'evil', 'dark'],
    ];
    const propRows = [
      ['Prop', 'Variant', 'Description', 'Height', 'Visual_Design', 'Art_Language'],
      ['sword', 'base', 'a blade', '', 'sharp', 'combat'],
      ['shield', 'base', '', '20-30cm', 'protective', 'defense'],
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
      height: 110, // "1.1m" → m ×100
      visual_design: 'mighty',
      art_language: 'epic',
    });

    const swordBase = parsed.result.props[0].variants[0];
    expect(swordBase).toMatchObject({
      key: 'base',
      description: 'a blade',
      height: null, // empty cell
      visual_design: 'sharp',
      art_language: 'combat',
    });

    expect(parsed.issues.errors).toHaveLength(0);
  });

  it('height column → cm number: "1.1m"→110, "110cm"→110, "20-30cm"→30 (max)', () => {
    const buffer = buildTestWorkbook();
    const parsed = parseWorkbook(buffer, XLSX);

    expect(parsed.result.characters[0].variants[0].height).toBe(110); // hero base "1.1m"
    expect(parsed.result.characters[1].variants[0].height).toBe(110); // villain base "110cm"
    expect(parsed.result.props[1].variants[0].height).toBe(30); // shield base "20-30cm"
  });

  it('empty cell → empty string (height → null, no warning)', () => {
    const buffer = buildTestWorkbook();
    const parsed = parseWorkbook(buffer, XLSX);

    const heroWounded = parsed.result.characters[0].variants[1];
    expect(heroWounded.description).toBe('');
    expect(heroWounded.height).toBeNull();
    expect(heroWounded.art_language).toBe('');
    expect(parsed.issues.warnings.some((w) => w.includes('height'))).toBe(false);
  });

  it('unparseable height → null + warning (variant still imported)', () => {
    const charRows = [
      ['Character', 'Variant', 'Description', 'Height', 'Visual_Design', 'Art_Language'],
      ['hero', 'base', 'a warrior', 'tall', 'mighty', 'epic'],
    ];
    const propRows = [['Prop', 'Variant', 'Description', 'Height', 'Visual_Design', 'Art_Language']];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(charRows), 'Characters');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(propRows), 'Props');
    const parsed = parseWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), XLSX);

    expect(parsed.result.characters[0].variants[0].height).toBeNull();
    expect(parsed.issues.errors).toHaveLength(0); // advisory only — import proceeds
    expect(parsed.issues.warnings.some((w) => w.includes('height "tall"'))).toBe(true);
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
