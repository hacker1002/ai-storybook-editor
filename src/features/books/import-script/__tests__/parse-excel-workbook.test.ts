import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseEntitySheet, parseImportWorkbook } from '../parse-excel-workbook';
import { CHARACTERS_ROWS, PROPS_ROWS, STAGES_ROWS } from './fixtures/sketch-manuscript-fixture';

// Entity sheets are read BY HEADER NAME (never positional): the Stages sheet has no `height`
// column, so fixed indices shifted visual_design/art_language by one on char/prop.

describe('parseEntitySheet', () => {
  it('parses each catalog sheet (skipping the header row)', () => {
    expect(parseEntitySheet(CHARACTERS_ROWS, 'character').rows).toHaveLength(15);
    expect(parseEntitySheet(PROPS_ROWS, 'prop').rows).toHaveLength(7);
    expect(parseEntitySheet(STAGES_ROWS, 'stage').rows).toHaveLength(8);
    const first = parseEntitySheet(CHARACTERS_ROWS, 'character').rows[0];
    expect(first).toMatchObject({ entity_type: 'character', key: 'kid', variant_key: 'base', ref: '@kid/base' });
  });

  it('defaults an empty variant column to "base"', () => {
    const { rows } = parseEntitySheet(
      [
        ['id', 'ref', 'stage', 'variant', 'description', 'visual_design', 'art_language'],
        ['', '@x/', 'x', '', 'desc', 'vd', 'al'],
      ],
      'stage',
    );
    expect(rows[0].variant_key).toBe('base');
  });

  it('reads by header even when the column ORDER differs', () => {
    const { rows, missingColumns } = parseEntitySheet(
      [
        ['Art_Language', 'Character', 'Visual_Design', 'Variant', 'Description', 'Height', 'Ref'],
        ['epic', 'hero', 'mighty', 'base', 'a warrior', '1.1m', '@hero/base'],
      ],
      'character',
    );
    expect(missingColumns).toEqual([]);
    expect(rows[0]).toMatchObject({
      key: 'hero',
      variant_key: 'base',
      ref: '@hero/base',
      description: 'a warrior',
      visual_design: 'mighty',
      art_language: 'epic',
      height: '1.1m',
    });
  });
});

// ── Full workbook (synthetic in-memory SheetJS — no fixture file on disk) ──────

type Aoa = string[][];

function buildWorkbook(sheets: Record<string, Aoa>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

const CHAR_AOA: Aoa = [
  ['id', 'ref', 'character', 'variant', 'description', 'height', 'visual_design', 'art_language'],
  ['id-0', '@kid/base', 'kid', 'base', 'Mô tả kid', '1.05 m', 'Visual kid', 'Art kid'],
  ['id-1', '@kid/hero', 'kid', 'hero', '', '110cm', 'Visual hero', 'Art hero'],
];
const PROP_AOA: Aoa = [
  ['id', 'ref', 'prop', 'variant', 'description', 'height', 'visual_design', 'art_language'],
  ['id-0', '@sword/base', 'sword', 'base', 'Mô tả sword', '20-30cm', 'Visual sword', 'Art sword'],
];
/** Stages sheet has NO `height` column — the positional trap this parser must survive. */
const STAGE_AOA: Aoa = [
  ['id', 'ref', 'stage', 'variant', 'description', 'visual_design', 'art_language'],
  ['id-0', '@bedroom/base', 'bedroom', 'base', 'Mô tả bedroom', 'Visual bedroom', 'Art bedroom'],
];

describe('parseImportWorkbook (synthetic SheetJS workbook)', () => {
  it('maps visual_design/art_language from their OWN columns (not description)', () => {
    const parsed = parseImportWorkbook(
      buildWorkbook({ Characters: CHAR_AOA, Props: PROP_AOA, Stages: STAGE_AOA }),
      XLSX,
    );

    expect(parsed.issues.warnings).toEqual([]);
    expect(parsed.characters).toHaveLength(2);
    expect(parsed.characters[0]).toMatchObject({
      key: 'kid',
      variant_key: 'base',
      description: 'Mô tả kid',
      visual_design: 'Visual kid',
      art_language: 'Art kid',
      height: '1.05 m',
    });
    expect(parsed.characters[0].visual_design).not.toBe(parsed.characters[0].description);
    expect(parsed.props[0]).toMatchObject({ key: 'sword', visual_design: 'Visual sword', height: '20-30cm' });
  });

  it('Stages sheet (no height column) → columns still resolve, height always empty', () => {
    const parsed = parseImportWorkbook(
      buildWorkbook({ Characters: CHAR_AOA, Props: PROP_AOA, Stages: STAGE_AOA }),
      XLSX,
    );
    expect(parsed.stages[0]).toMatchObject({
      key: 'bedroom',
      description: 'Mô tả bedroom',
      visual_design: 'Visual bedroom',
      art_language: 'Art bedroom',
      height: '',
    });
    expect(parsed.issues.warnings.some((w) => w.includes('Stages'))).toBe(false);
  });

  it('a sheet missing the new columns → warning listing them, import still yields rows', () => {
    const legacyChars: Aoa = [
      ['id', 'ref', 'character', 'variant', 'description'],
      ['id-0', '@kid/base', 'kid', 'base', 'Mô tả kid'],
    ];
    const parsed = parseImportWorkbook(
      buildWorkbook({ Characters: legacyChars, Props: PROP_AOA, Stages: STAGE_AOA }),
      XLSX,
    );

    expect(parsed.characters).toHaveLength(1);
    expect(parsed.characters[0]).toMatchObject({ key: 'kid', visual_design: '', art_language: '', height: '' });
    const warning = parsed.issues.warnings.find((w) => w.includes('Characters'));
    expect(warning).toBeDefined();
    expect(warning).toContain('visual_design');
    expect(warning).toContain('art_language');
    expect(warning).toContain('height');
    expect(parsed.issues.errors).toEqual([]);
  });

  it('key column missing → BLOCKING error (never a silent empty catalog)', () => {
    // 'name' instead of 'character' — the rows cannot be identified, so importing 0 characters
    // with only an advisory would drop the whole cast silently.
    const renamedKey: Aoa = [
      ['id', 'ref', 'name', 'variant', 'description', 'height', 'visual_design', 'art_language'],
      ['id-0', '@kid/base', 'kid', 'base', 'Mô tả kid', '1.05 m', 'Visual kid', 'Art kid'],
    ];
    const parsed = parseImportWorkbook(
      buildWorkbook({ Characters: renamedKey, Props: PROP_AOA, Stages: STAGE_AOA }),
      XLSX,
    );

    expect(parsed.characters).toEqual([]);
    const error = parsed.issues.errors.find((e) => e.includes('Characters'));
    expect(error).toBeDefined();
    expect(error).toContain('character');
    // The advisory columns are NOT promoted to errors by this branch.
    expect(parsed.props).toHaveLength(1);
  });

  it('variant column missing → BLOCKING error too', () => {
    const noVariant: Aoa = [
      ['id', 'ref', 'stage', 'description', 'visual_design', 'art_language'],
      ['id-0', '@bedroom/base', 'bedroom', 'Mô tả bedroom', 'Visual bedroom', 'Art bedroom'],
    ];
    const parsed = parseImportWorkbook(
      buildWorkbook({ Characters: CHAR_AOA, Props: PROP_AOA, Stages: noVariant }),
      XLSX,
    );

    expect(parsed.stages).toEqual([]);
    expect(parsed.issues.errors.some((e) => e.includes('Stages') && e.includes('variant'))).toBe(true);
  });

  it('parseEntitySheet reports the missing required columns and reads no rows', () => {
    const { rows, missingRequired, missingColumns } = parseEntitySheet(
      [
        ['id', 'ref', 'description'],
        ['id-0', '@kid/base', 'Mô tả kid'],
      ],
      'character',
    );
    expect(rows).toEqual([]);
    expect(missingRequired).toEqual(['character', 'variant']);
    // Advisory columns are still reported (they are simply not blocking).
    expect(missingColumns).toContain('visual_design');
  });

  it('a completely BLANK entity sheet warns like an absent one (never blocks)', () => {
    // "This book has no props" — a blank sheet carries no header row, so the missing key/variant
    // columns must NOT be read as a broken template.
    const parsed = parseImportWorkbook(
      buildWorkbook({ Characters: CHAR_AOA, Props: [], Stages: STAGE_AOA }),
      XLSX,
    );

    expect(parsed.issues.errors).toEqual([]);
    expect(parsed.props).toEqual([]);
    expect(parsed.issues.warnings.some((w) => w.includes('Props'))).toBe(true);
    expect(parsed.characters).toHaveLength(2);
  });

  it('an absent entity sheet warns instead of throwing', () => {
    const parsed = parseImportWorkbook(buildWorkbook({ Characters: CHAR_AOA }), XLSX);
    expect(parsed.props).toEqual([]);
    expect(parsed.stages).toEqual([]);
    expect(parsed.issues.warnings.some((w) => w.includes('Props'))).toBe(true);
    expect(parsed.issues.warnings.some((w) => w.includes('Stages'))).toBe(true);
  });
});
