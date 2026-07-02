import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { getSketchTextboxContent } from '@/types/sketch';
import {
  STORYBOARD_MATRIX,
  VI_VN_MATRIX,
  EN_US_MATRIX,
} from '@/features/books/import-script/__tests__/fixtures/sketch-manuscript-fixture';
import { parseSketchSpreadsFromFile, type SketchImportBook } from './parse-sketch-spreads';

const book: SketchImportBook = { original_language: 'vi_VN', typography: null };

/** Build a real .xlsx (SheetJS) from fixture matrices → a File-like object. Exercises
 *  the full wrapper: XLSX.read → SketchImportWorkbook adapter → shared parser. */
function fixtureFile(sheets: Record<string, unknown[][]>): File {
  const wb = XLSX.utils.book_new();
  for (const [name, matrix] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), name);
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const bytes = out instanceof ArrayBuffer ? new Uint8Array(out) : (out as Uint8Array);
  // Slice to the exact backing region — SheetJS may return a view over a larger buffer.
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return {
    name: 'dummy.xlsx',
    size: bytes.byteLength,
    arrayBuffer: async () => ab,
  } as unknown as File;
}

describe('parseSketchSpreadsFromFile — new template end-to-end', () => {
  it('reads a real workbook → thin sketch spreads (13-field art_direction + multilang textboxes)', async () => {
    const file = fixtureFile({ Storyboard: STORYBOARD_MATRIX, vi_VN: VI_VN_MATRIX, en_US: EN_US_MATRIX });
    const { spreads, issues } = await parseSketchSpreadsFromFile(file, book);

    expect(issues.errors).toEqual([]);
    expect(spreads).toHaveLength(3);
    expect(spreads.every((s) => s.images.length === 0)).toBe(true);

    // DPS spread → one full page; two-page spreads → left+right.
    expect(spreads[0].pages.map((p) => p.type)).toEqual(['full']);
    expect(spreads[1].pages.map((p) => p.type)).toEqual(['left', 'right']);

    // art_direction: 13 fields, action merges Diễn biến + Character.
    const s2left = spreads[1].pages[0].art_direction;
    expect(s2left.camera).toBe('Camera 2 TRÁI');
    expect(s2left.action).toBe('Diễn biến 2 TRÁI\nCharacter 2 TRÁI');

    // Multilang textbox with per-language geometry (vi vertical, en horizontal band).
    const tb = spreads[1].textboxes[0];
    expect(getSketchTextboxContent(tb, 'vi_VN')?.geometry).toEqual({ x: 80, y: 10, w: 16, h: 78 });
    expect(getSketchTextboxContent(tb, 'en_US')?.geometry).toEqual({ x: 6, y: 74, w: 70, h: 22 });
  });

  it('missing Storyboard sheet → blocking error, no throw', async () => {
    const file = fixtureFile({ vi_VN: VI_VN_MATRIX });
    const { spreads, issues } = await parseSketchSpreadsFromFile(file, book);
    expect(spreads).toEqual([]);
    expect(issues.errors.some((e) => /Storyboard/.test(e))).toBe(true);
  });
});
