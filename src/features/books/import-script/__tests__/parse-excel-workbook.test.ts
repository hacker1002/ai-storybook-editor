import { describe, it, expect } from 'vitest';
import {
  canonNodeKey,
  deriveNodes,
  laneToNodeId,
  parseEntitySheet,
  parseFlow,
  parseNodeId,
  parseStoryboard,
} from '../parse-excel-workbook';
import type { Lane, ParsedSpreadCell } from '../import-script-types';
import {
  CHARACTERS_ROWS,
  FLOW_ROWS,
  PROPS_ROWS,
  STAGES_ROWS,
  STORYBOARD_MATRIX,
  CHOICE_PROMPT,
} from './fixtures/visual-manuscript-fixture';

const cellOf = (cells: ParsedSpreadCell[], lane: Lane, n: number) =>
  cells.find((c) => c.lane === lane && c.spread_number === n);

describe('node id helpers', () => {
  it('parseNodeId — default lane (bare number) vs prefixed lane', () => {
    expect(parseNodeId('16')).toEqual({ lane: 'truc_chinh', n: 16 });
    expect(parseNodeId('truc_chinh.11')).toEqual({ lane: 'truc_chinh', n: 11 });
    expect(parseNodeId('nhanh_1.11')).toEqual({ lane: 'nhanh_1', n: 11 });
    expect(parseNodeId('garbage')).toBeNull();
  });

  it('laneToNodeId + canonNodeKey — bare and prefixed share a canonical key', () => {
    expect(laneToNodeId('truc_chinh', 11)).toBe('11');
    expect(laneToNodeId('nhanh_1', 11)).toBe('nhanh_1.11');
    // '11' (bare) and 'truc_chinh.11' (prefixed) MUST canonicalize identically
    expect(canonNodeKey('truc_chinh', 11)).toBe(canonNodeKey(parseNodeId('truc_chinh.11')!.lane, 11));
  });
});

describe('parseFlow', () => {
  const edges = parseFlow(FLOW_ROWS);

  it('emits one edge per flow row (continue/choice/end)', () => {
    // 9 intro + 2 choice + 4 tc + 1 tc→16 + 4 n1 + 1 n1→16 + 1 end = 22
    expect(edges).toHaveLength(22);
  });

  it('captures the choice edges from node 10 with prompt + labels', () => {
    const choices = edges.filter((e) => e.type === 'choice');
    expect(choices).toHaveLength(2);
    expect(choices.every((c) => c.from === '10')).toBe(true);
    expect(choices[0].choice_prompt).toBe(CHOICE_PROMPT);
    expect(choices.map((c) => c.to)).toEqual(['truc_chinh.11', 'nhanh_1.11']);
  });

  it('captures the ending edge', () => {
    const ends = edges.filter((e) => e.type === 'end');
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ from: '16', to: 'END' });
  });
});

describe('deriveNodes', () => {
  const nodes = deriveNodes(parseFlow(FLOW_ROWS));

  it('derives exactly 21 distinct nodes (END excluded)', () => {
    expect(nodes).toHaveLength(21);
    expect(nodes.some((n) => n.node_id.toUpperCase() === 'END')).toBe(false);
  });

  it('resolves lane + number correctly', () => {
    expect(nodes.find((n) => n.node_id === '16')).toMatchObject({ lane: 'truc_chinh', spread_number: 16 });
    expect(nodes.find((n) => n.node_id === 'nhanh_1.11')).toMatchObject({ lane: 'nhanh_1', spread_number: 11 });
    expect(nodes.find((n) => n.node_id === 'truc_chinh.15')).toMatchObject({ lane: 'truc_chinh', spread_number: 15 });
  });

  it('dedups bare and prefixed default-lane ids for the same spread (canonical)', () => {
    // '7' and 'truc_chinh.7' are the SAME spread (truc_chinh#7) → one node, not two
    const mixed = deriveNodes([
      { from: '7', type: 'continue', to: 'truc_chinh.7' },
      { from: 'truc_chinh.7', type: 'continue', to: '8' },
    ]);
    const sevens = mixed.filter((n) => n.lane === 'truc_chinh' && n.spread_number === 7);
    expect(sevens).toHaveLength(1);
  });
});

describe('parseStoryboard', () => {
  const warnings: string[] = [];
  const cells = parseStoryboard(STORYBOARD_MATRIX, warnings);

  it('produces 21 cells joined by (number, lane)', () => {
    expect(cells).toHaveLength(21);
    expect(warnings).toHaveLength(0); // fixture has no DPS-right content
  });

  it('flags DPS blocks {1,4,5,6,14,16} (block 14 applies to BOTH lanes)', () => {
    const dps = cells.filter((c) => c.is_dps);
    expect(dps).toHaveLength(7); // 1,4,5,6 + tc.14 + n1.14 + 16
    expect(cellOf(cells, 'truc_chinh', 14)?.is_dps).toBe(true);
    expect(cellOf(cells, 'nhanh_1', 14)?.is_dps).toBe(true);
  });

  it('DPS cell → 1 page; 2-page cell → 2 pages', () => {
    expect(cellOf(cells, 'truc_chinh', 1)?.pages).toHaveLength(1);
    expect(cellOf(cells, 'truc_chinh', 2)?.pages).toHaveLength(2);
  });

  it('one branch-region row → 2 spreads (one per lane present)', () => {
    expect(cellOf(cells, 'truc_chinh', 11)).toBeDefined();
    expect(cellOf(cells, 'nhanh_1', 11)).toBeDefined();
    // intro region has no branch lane
    expect(cellOf(cells, 'nhanh_1', 3)).toBeUndefined();
  });

  it('maps the 4 content labels into page fields', () => {
    const c = cellOf(cells, 'truc_chinh', 2)!;
    expect(c.pages[0].dien_bien).toBe('Cảnh 2 TRÁI');
    expect(c.pages[1].dien_bien).toBe('Cảnh 2 PHẢI');
    expect(c.pages[0].stage_ref).toBe('@bedroom/base');
    expect(c.pages[0].loi_van).toBe('Lời văn 2 TRÁI');
    expect(c.pages[0].chi_dao_hinh_anh).toBe('Góc máy 2 TRÁI');
  });

  it('warns when a DPS block has right-column content (prefers left)', () => {
    const w: string[] = [];
    const out = parseStoryboard(
      [
        ['SPREAD 1 TRANG ĐÔI', '', '', '', ''],
        ['Diễn biến', 'left scene', 'RIGHT LEAK', '', ''],
        ['Stage', '', '', '', ''],
        ['Lời văn', 'left text', '', '', ''],
        ['Chỉ đạo hình ảnh', '', '', '', ''],
      ],
      w,
    );
    expect(out).toHaveLength(1);
    expect(out[0].is_dps).toBe(true);
    expect(out[0].pages).toHaveLength(1);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/PHẢI/);
  });
});

describe('parseEntitySheet', () => {
  it('parses each catalog sheet by position (skipping the header row)', () => {
    expect(parseEntitySheet(CHARACTERS_ROWS, 'character')).toHaveLength(15);
    expect(parseEntitySheet(PROPS_ROWS, 'prop')).toHaveLength(7);
    expect(parseEntitySheet(STAGES_ROWS, 'stage')).toHaveLength(11);
    const first = parseEntitySheet(CHARACTERS_ROWS, 'character')[0];
    expect(first).toMatchObject({ entity_type: 'character', key: 'kid', variant_key: 'base', ref: '@kid/base' });
  });
});
