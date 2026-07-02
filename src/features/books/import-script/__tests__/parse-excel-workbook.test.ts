import { describe, it, expect } from 'vitest';
import { parseEntitySheet } from '../parse-excel-workbook';
import { CHARACTERS_ROWS, PROPS_ROWS, STAGES_ROWS } from './fixtures/sketch-manuscript-fixture';

// Flow / Storyboard-cell / node parsing was removed with the sketch cutover — only the
// positional entity-sheet parser remains here (spread parsing lives in sketch-spread-excel).

describe('parseEntitySheet', () => {
  it('parses each catalog sheet by position (skipping the header row)', () => {
    expect(parseEntitySheet(CHARACTERS_ROWS, 'character')).toHaveLength(15);
    expect(parseEntitySheet(PROPS_ROWS, 'prop')).toHaveLength(7);
    expect(parseEntitySheet(STAGES_ROWS, 'stage')).toHaveLength(8);
    const first = parseEntitySheet(CHARACTERS_ROWS, 'character')[0];
    expect(first).toMatchObject({ entity_type: 'character', key: 'kid', variant_key: 'base', ref: '@kid/base' });
  });

  it('defaults an empty variant column to "base"', () => {
    const rows = parseEntitySheet([['id', 'ref', 'stage', 'variant', 'description'], ['', '@x/', 'x', '', 'desc']], 'stage');
    expect(rows[0].variant_key).toBe('base');
  });
});
