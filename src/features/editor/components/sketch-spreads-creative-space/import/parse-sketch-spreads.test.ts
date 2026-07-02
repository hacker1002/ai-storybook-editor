import { describe, it, expect } from 'vitest';
import { parseStoryboard, type SheetMatrix } from '@/features/books/import-script/parse-excel-workbook';
import type { ParsedPageCell } from '@/features/books/import-script/import-script-types';
import {
  DEFAULT_LEFT_TEXTBOX_GEO,
  DEFAULT_RIGHT_TEXTBOX_GEO,
  DEFAULT_DPS_TEXTBOX_GEO,
} from '@/features/books/import-script/import-script-constants';
import { getSketchTextboxContent, isSketchTextboxContent } from '@/types/sketch';
import {
  buildArtDirection,
  buildTextbox,
  buildSketchSpread,
  type SketchImportBook,
} from './parse-sketch-spreads';

// Book.typography is a PER-LANGUAGE map (keyed by language code) of snake_case TypographySettings.
const book: SketchImportBook = {
  original_language: 'vi_VN',
  typography: {
    vi_VN: {
      size: 20,
      weight: 400,
      style: 'normal',
      family: 'Nunito',
      color: '#111111',
      line_height: 1.4,
      letter_spacing: 0,
      decoration: 'none',
      text_align: 'left',
      text_transform: 'none',
    },
  },
};

const page = (over: Partial<ParsedPageCell> = {}): ParsedPageCell => ({
  dien_bien: undefined,
  stage_ref: undefined,
  loi_van: undefined,
  chi_dao_hinh_anh: undefined,
  ...over,
});

describe('buildArtDirection — Chỉ đạo sub-field parse (§2.1/§2.2)', () => {
  it('maps labeled sub-fields to the right ArtDirection keys (incl. en-dash label)', () => {
    const ad = buildArtDirection(
      page({
        stage_ref: '@bedroom/night',
        dien_bien: 'Bé thức dậy',
        chi_dao_hinh_anh: [
          'Góc máy: Trung cảnh',
          'Bố cục: Trung tâm',
          'Nhân vật: @kid/base',
          'Bối cảnh: phòng ngủ',
          'Không gian–thời gian: ban đêm', // en-dash
          'Ánh sáng & màu: ấm',
          'Ý tưởng nghệ thuật: mơ màng',
          'Interactive: chạm vào cửa sổ',
          'Ambient: tiếng chim',
          'Tách layer: rèm cửa',
        ].join('\n'),
      }),
    );
    expect(ad.stage).toBe('@bedroom/night');
    expect(ad.camera).toBe('Trung cảnh');
    expect(ad.composition).toBe('Trung tâm');
    expect(ad.setting).toBe('phòng ngủ');
    expect(ad.space_time).toBe('ban đêm');
    expect(ad.light_color).toBe('ấm');
    expect(ad.art_concept).toBe('mơ màng');
    expect(ad.interactive_intent).toBe('chạm vào cửa sổ');
    // §2.2 derive
    expect(ad.sound).toBe('tiếng chim');
    expect(ad.layers).toBe('rèm cửa');
    // action = Diễn biến + Nhân vật (merged)
    expect(ad.action).toBe('Bé thức dậy\n@kid/base');
    // untouched fields default to ''
    expect(ad.animation).toBe('');
    expect(ad.negative_space).toBe('');
  });

  it('folds leading free-text (no label) into art_concept, losing nothing', () => {
    const ad = buildArtDirection(
      page({ chi_dao_hinh_anh: 'Ghi chú tự do không nhãn\nGóc máy: Cận cảnh' }),
    );
    expect(ad.camera).toBe('Cận cảnh');
    expect(ad.art_concept).toContain('Ghi chú tự do không nhãn');
  });

  it('keeps a multi-line sub-field value (continuation lines)', () => {
    const ad = buildArtDirection(
      page({ chi_dao_hinh_anh: 'Bố cục: dòng 1\ndòng 2\nGóc máy: xa' }),
    );
    expect(ad.composition).toBe('dòng 1\ndòng 2');
    expect(ad.camera).toBe('xa');
  });

  it('leaves derived fields empty when Interactive block has no Ambient/Layer', () => {
    const ad = buildArtDirection(page({ chi_dao_hinh_anh: 'Interactive: hot-spot' }));
    expect(ad.interactive_intent).toBe('hot-spot');
    expect(ad.sound).toBe('');
    expect(ad.layers).toBe('');
  });
});

describe('buildTextbox', () => {
  it('returns null for empty / whitespace Lời văn', () => {
    expect(buildTextbox(undefined, book, DEFAULT_LEFT_TEXTBOX_GEO)).toBeNull();
    expect(buildTextbox('   \n  ', book, DEFAULT_LEFT_TEXTBOX_GEO)).toBeNull();
  });

  it('builds a per-language textbox with the given bottom-band geometry + merged typography', () => {
    const tb = buildTextbox('Ngày mới\nbắt đầu.', book, DEFAULT_LEFT_TEXTBOX_GEO)!;
    expect(tb.id).toBeTruthy();
    const content = tb.vi_VN;
    expect(isSketchTextboxContent(content)).toBe(true);
    if (!isSketchTextboxContent(content)) return;
    expect(content.text).toBe('Ngày mới\nbắt đầu.'); // line breaks preserved
    expect(content.geometry).toEqual({ x: 5, y: 78, w: 40, h: 18 });
    // Typography inherited from the book's per-language settings (snake_case → camelCase).
    expect(content.typography.size).toBe(20);
    expect(content.typography.color).toBe('#111111');
    expect(content.typography.family).toBe('Nunito');
    expect(content.typography.lineHeight).toBe(1.4);
    // No language-keyed pollution leaked into the flat Typography object.
    expect(content.typography).not.toHaveProperty('vi_VN');
  });

  it('falls back to the default typography when the book has no entry for the language', () => {
    const tb = buildTextbox('x', { original_language: 'vi_VN', typography: null }, DEFAULT_LEFT_TEXTBOX_GEO)!;
    const content = tb.vi_VN;
    if (!isSketchTextboxContent(content)) throw new Error('expected content');
    expect(content.typography.size).toBe(16);
    expect(content.typography.color).toBe('#000000');
  });
});

describe('buildSketchSpread', () => {
  const cellBase = { node_id: '1', spread_number: 1, lane: 'truc_chinh' as const };

  it('DPS cell → single full page + one wide bottom textbox from the full column', () => {
    const spread = buildSketchSpread(
      { ...cellBase, is_dps: true, pages: [page({ stage_ref: '@forest', loi_van: 'Rừng xanh.' })] },
      book,
    );
    expect(spread.images).toEqual([]);
    expect(spread.pages.map((p) => p.type)).toEqual(['full']);
    expect(spread.pages[0].art_direction.stage).toBe('@forest');
    expect(spread.textboxes).toHaveLength(1);
    expect(getSketchTextboxContent(spread.textboxes[0], 'vi_VN')?.geometry).toEqual(
      DEFAULT_DPS_TEXTBOX_GEO,
    );
  });

  it('non-DPS cell with both Lời văn → TWO bottom textboxes (left + right), single image', () => {
    const spread = buildSketchSpread(
      {
        ...cellBase,
        is_dps: false,
        pages: [
          page({ stage_ref: '@a', loi_van: 'Trang trái.' }),
          page({ stage_ref: '@b', loi_van: 'Trang phải.' }),
        ],
      },
      book,
    );
    expect(spread.images).toEqual([]); // no image generated yet — one shared backdrop, not two
    expect(spread.pages.map((p) => p.type)).toEqual(['left', 'right']);
    expect(spread.textboxes).toHaveLength(2);
    const left = getSketchTextboxContent(spread.textboxes[0], 'vi_VN');
    const right = getSketchTextboxContent(spread.textboxes[1], 'vi_VN');
    expect(left?.text).toBe('Trang trái.');
    expect(left?.geometry).toEqual(DEFAULT_LEFT_TEXTBOX_GEO); // x:5, bottom band
    expect(right?.text).toBe('Trang phải.');
    expect(right?.geometry).toEqual(DEFAULT_RIGHT_TEXTBOX_GEO); // x:55, bottom band
  });

  it('non-DPS cell → left + right pages; only one side has Lời văn → single textbox on that side', () => {
    const spread = buildSketchSpread(
      {
        ...cellBase,
        is_dps: false,
        pages: [page({ stage_ref: '@a', loi_van: 'Chỉ trang trái.' }), page({ stage_ref: '@b' })],
      },
      book,
    );
    expect(spread.pages.map((p) => p.type)).toEqual(['left', 'right']);
    expect(spread.pages[0].art_direction.stage).toBe('@a');
    expect(spread.pages[1].art_direction.stage).toBe('@b');
    expect(spread.textboxes).toHaveLength(1);
    expect(getSketchTextboxContent(spread.textboxes[0], 'vi_VN')?.geometry).toEqual(
      DEFAULT_LEFT_TEXTBOX_GEO,
    );
  });

  it('non-DPS cell → both sides empty Lời văn → no textbox', () => {
    const spread = buildSketchSpread(
      {
        ...cellBase,
        is_dps: false,
        pages: [page({ stage_ref: '@a' }), page({ stage_ref: '@b' })],
      },
      book,
    );
    expect(spread.textboxes).toHaveLength(0);
  });
});

describe('integration: parseStoryboard (shared splitter) → SketchSpread[]', () => {
  it('splits SPREAD blocks and maps DPS vs 2-page correctly', () => {
    const matrix: SheetMatrix = [
      ['', 'TRỤC CHÍNH TRÁI', 'TRỤC CHÍNH PHẢI'],
      ['SPREAD 1', '', ''],
      ['Stage', '@bedroom/night', '@bedroom/day'],
      ['Diễn biến', 'Bé thức dậy', 'Bé nhìn cửa sổ'],
      ['Chỉ đạo hình ảnh', 'Góc máy: Trung cảnh\nAmbient: tiếng chim', 'Góc máy: Cận cảnh'],
      ['Lời văn', 'Ngày mới bắt đầu.', ''],
      ['SPREAD 2 TRANG ĐÔI', '', ''],
      ['Stage', '@forest/day', ''],
      ['Chỉ đạo hình ảnh', 'Bối cảnh: rừng rậm', ''],
      ['Lời văn', 'Rừng xanh bạt ngàn.', ''],
    ];
    const warnings: string[] = [];
    const cells = parseStoryboard(matrix, warnings);
    const spreads = cells.map((cell) => buildSketchSpread(cell, book));

    expect(spreads).toHaveLength(2);
    // Spread 1 — 2 pages
    expect(spreads[0].pages.map((p) => p.type)).toEqual(['left', 'right']);
    expect(spreads[0].pages[0].art_direction.camera).toBe('Trung cảnh');
    expect(spreads[0].pages[0].art_direction.sound).toBe('tiếng chim');
    expect(spreads[0].pages[1].art_direction.camera).toBe('Cận cảnh');
    expect(spreads[0].textboxes).toHaveLength(1);
    // Spread 2 — DPS full page
    expect(spreads[1].pages.map((p) => p.type)).toEqual(['full']);
    expect(spreads[1].pages[0].art_direction.setting).toBe('rừng rậm');
  });
});
