import { describe, it, expect } from 'vitest';
import {
  buildPage,
  buildSketchSpreadsFromWorkbook,
  buildTextboxes,
  parseGeo,
  splitLangBlocks,
  splitSpreadBlocks,
} from '../sketch-spread-excel';
import { getSketchTextboxContent } from '@/types/sketch';
import type { SheetMatrix, SketchImportBook } from '../sketch-spread-excel.types';
import {
  FIXTURE_SHEETS,
  STORYBOARD_MATRIX,
  VI_VN_MATRIX,
  EN_US_MATRIX,
  makeSketchWorkbook,
} from './fixtures/sketch-manuscript-fixture';

const book: SketchImportBook = {
  original_language: 'vi_VN',
  typography: {
    vi_VN: {
      size: 20, weight: 400, style: 'normal', family: 'Nunito', color: '#111111',
      line_height: 1.4, letter_spacing: 0, decoration: 'none', text_align: 'left', text_transform: 'none',
    },
  },
};

describe('splitSpreadBlocks', () => {
  it('splits one block per SPREAD header, DPS flag from the header marker', () => {
    const warnings: string[] = [];
    const blocks = splitSpreadBlocks(STORYBOARD_MATRIX, warnings);
    expect(blocks.map((b) => b.n)).toEqual([1, 2, 3]);
    expect(blocks[0].isDPS).toBe(true); // SPREAD 1 — TRANG ĐÔI
    expect(blocks[1].isDPS).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('cell(label, col) reads the main lane; branch cols exist but are never asked for', () => {
    const blocks = splitSpreadBlocks(STORYBOARD_MATRIX, []);
    const s2 = blocks[1];
    expect(s2.cell('Camera', 1)).toBe('Camera 2 TRÁI');
    expect(s2.cell('Camera', 2)).toBe('Camera 2 PHẢI');
  });

  it('warns on an unknown row label (ignored)', () => {
    const w: string[] = [];
    splitSpreadBlocks(
      [
        ['SPREAD 1', '', ''],
        ['Camera', 'x', ''],
        ['Bogus label', 'y', ''],
      ],
      w,
    );
    expect(w.some((m) => /Bogus label/.test(m))).toBe(true);
  });

  it('warns when a DPS block carries RIGHT-column content (prefers left)', () => {
    const w: string[] = [];
    const blocks = splitSpreadBlocks(
      [
        ['SPREAD 1 — TRANG ĐÔI', '', ''],
        ['Stage', '@bedroom/base', '@leak/base'],
      ],
      w,
    );
    expect(blocks[0].isDPS).toBe(true);
    expect(w.some((m) => /PHẢI/.test(m))).toBe(true);
  });
});

describe('splitLangBlocks', () => {
  it('keys blocks by N with per-column loiVan + textbox rows (Lời văn matched by prefix)', () => {
    const vi = splitLangBlocks(VI_VN_MATRIX);
    expect(Object.keys(vi).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(vi[2].loiVan[1]).toBe('VI 2 TRÁI');
    expect(vi[2].loiVan[2]).toBe('VI 2 PHẢI');
    expect(vi[2].textbox[1]).toBe('x=80% y=10% w=16% h=78% font_size=22');
    expect(vi[1].isDPS).toBe(true);
  });
});

describe('parseGeo', () => {
  it('parses x/y/w/h + font_size, dropping the % sign', () => {
    expect(parseGeo('x=4% y=12% w=16% h=76% font_size=22')).toEqual({
      box: { x: 4, y: 12, w: 16, h: 76 },
      font_size: 22,
    });
  });
  it('returns null on empty or when any of x/y/w/h is missing', () => {
    expect(parseGeo(undefined)).toBeNull();
    expect(parseGeo('x=1 y=2 w=3')).toBeNull(); // no h
  });
  it('omits font_size when absent but keeps the box', () => {
    expect(parseGeo('x=1 y=2 w=3 h=4')).toEqual({ box: { x: 1, y: 2, w: 3, h: 4 } });
  });
});

describe('buildPage', () => {
  const blocks = splitSpreadBlocks(STORYBOARD_MATRIX, []);
  it('maps 13 art_direction fields directly; action = Diễn biến + Character', () => {
    const page = buildPage('left', blocks[1], 1);
    expect(page.type).toBe('left');
    expect(page.art_direction.camera).toBe('Camera 2 TRÁI');
    expect(page.art_direction.stage).toBe('@bedroom/base');
    expect(page.art_direction.negative_space).toBe('Negative space 2 TRÁI');
    expect(page.art_direction.action).toBe('Diễn biến 2 TRÁI\nCharacter 2 TRÁI');
  });

  it('reads ONLY the main lane — branch D/E columns are never mapped', () => {
    // SPREAD 3 carries branch data in cols 3/4; buildPage(col 1) must ignore it.
    const page = buildPage('left', blocks[2], 1);
    expect(page.art_direction.camera).toBe('Camera 3 TRÁI');
    expect(page.art_direction.camera).not.toContain('NHÁNH');
  });
});

describe('buildTextboxes — multilang', () => {
  const vi = splitLangBlocks(VI_VN_MATRIX);
  const en = splitLangBlocks(EN_US_MATRIX);
  const langBlocks = { vi_VN: vi, en_US: en };
  const langNames = ['vi_VN', 'en_US'];

  it('merges both languages into one textbox per side with per-language geometry', () => {
    const boxes = buildTextboxes(
      2,
      [{ type: 'left', col: 1 }, { type: 'right', col: 2 }],
      langNames,
      langBlocks,
      book,
      [],
    );
    expect(boxes).toHaveLength(2);
    const left = boxes[0];
    const viC = getSketchTextboxContent(left, 'vi_VN')!;
    const enC = getSketchTextboxContent(left, 'en_US')!;
    expect(viC.text).toBe('VI 2 TRÁI');
    expect(viC.geometry).toEqual({ x: 80, y: 10, w: 16, h: 78 });
    expect(viC.typography.size).toBe(22); // font_size override
    expect(viC.typography.color).toBe('#111111'); // from book typography
    expect(enC.geometry).toEqual({ x: 6, y: 74, w: 70, h: 22 });
    expect(enC.typography.size).toBe(24);
  });

  it('skips a language with no text on that side (no empty placeholder)', () => {
    const viOnly = { vi_VN: { 5: { n: 5, isDPS: false, loiVan: [undefined, 'only vi'], textbox: [undefined, undefined] } }, en_US: {} };
    const boxes = buildTextboxes(5, [{ type: 'left', col: 1 }], ['vi_VN', 'en_US'], viOnly, book, []);
    expect(boxes).toHaveLength(1);
    expect(getSketchTextboxContent(boxes[0], 'vi_VN')).toBeDefined();
    expect(getSketchTextboxContent(boxes[0], 'en_US')).toBeUndefined();
  });

  it('falls back to the default per-side geometry + warns when the Textbox row is unparseable', () => {
    const w: string[] = [];
    const blocks = { vi_VN: { 5: { n: 5, isDPS: false, loiVan: [undefined, 'txt'], textbox: [undefined, 'garbage'] } } };
    const boxes = buildTextboxes(5, [{ type: 'left', col: 1 }], ['vi_VN'], blocks, book, w);
    const geo = getSketchTextboxContent(boxes[0], 'vi_VN')!.geometry;
    expect(geo).toEqual({ x: 5, y: 78, w: 40, h: 18 }); // DEFAULT_LEFT_TEXTBOX_GEO
    expect(w.some((m) => /Textbox/.test(m))).toBe(true);
  });
});

describe('buildSketchSpreadsFromWorkbook — orchestrator', () => {
  it('builds one thin SketchSpread per block; DPS → 1 full page, else 2 pages; images always []', () => {
    const { spreads, issues } = buildSketchSpreadsFromWorkbook(makeSketchWorkbook(FIXTURE_SHEETS), book);
    expect(spreads).toHaveLength(3);
    expect(issues.errors).toEqual([]);
    expect(issues.warnings).toEqual([]);
    expect(spreads.every((s) => s.images.length === 0)).toBe(true);
    expect(spreads[0].pages.map((p) => p.type)).toEqual(['full']); // DPS
    expect(spreads[1].pages.map((p) => p.type)).toEqual(['left', 'right']);
    // SPREAD 2 textbox multilang assertion (design 04 §example / 07-01 §8).
    const s2Left = spreads[1].textboxes[0];
    expect(getSketchTextboxContent(s2Left, 'vi_VN')?.geometry).toEqual({ x: 80, y: 10, w: 16, h: 78 });
    expect(getSketchTextboxContent(s2Left, 'en_US')?.geometry).toEqual({ x: 6, y: 74, w: 70, h: 22 });
  });

  it('a missing Storyboard sheet is a blocking error, not a throw', () => {
    const { spreads, issues } = buildSketchSpreadsFromWorkbook(makeSketchWorkbook({}), book);
    expect(spreads).toEqual([]);
    expect(issues.errors.some((e) => /Storyboard/.test(e))).toBe(true);
  });

  it('no SPREAD blocks → blocking error', () => {
    const empty: SheetMatrix = [['', 'A', 'B']];
    const { issues } = buildSketchSpreadsFromWorkbook(makeSketchWorkbook({ Storyboard: empty }), book);
    expect(issues.errors.some((e) => /SPREAD/.test(e))).toBe(true);
  });

  it('warns when no language tab is present (textboxes empty)', () => {
    const { spreads, issues } = buildSketchSpreadsFromWorkbook(
      makeSketchWorkbook({ Storyboard: STORYBOARD_MATRIX }),
      book,
    );
    expect(spreads).toHaveLength(3);
    expect(spreads.every((s) => s.textboxes.length === 0)).toBe(true);
    expect(issues.warnings.some((wm) => /tab ngôn ngữ/.test(wm))).toBe(true);
  });
});
