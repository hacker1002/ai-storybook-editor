// visual-manuscript-fixture.ts — In-repo fixture mirroring design spec §8
// (`visual_manuscript.xlsx`). Sheet matrices are constructed JS arrays (the shape
// `sheet_to_json(header:1)` yields) so transform fns test without binary/SheetJS.
//
// Graph (§8): 1→…→10 ─choice→ { truc_chinh.11..15 (default) | nhanh_1.11..15 } → 16 (END)
// 21 nodes · DPS blocks {1,4,5,6,14,16} · choice on spread 10 · 2 branch sections
// · 7 characters / 6 props / 8 stages.

import { DPS_MARKER, ROW_LABEL } from '../../import-script-constants';
import { parseEntitySheet, parseFlow, parseStoryboard, deriveNodes } from '../../parse-excel-workbook';
import { assembleSnapshot } from '../../build-snapshot-from-parsed';
import type { ImportModalMeta, ParsedWorkbook } from '../../import-script-types';
import type { SheetMatrix } from '../../parse-excel-workbook';

const PROMPT = 'Bé sẽ hoá giải Quỷ Màn Đêm bằng cách nào?';

export const CHOICE_PROMPT = PROMPT;
export const DEFAULT_LABEL = 'Dùng ánh sáng từ bên trong';
export const BRANCH_LABEL = 'Kết bạn với quỷ';

// ── Flow sheet ────────────────────────────────────────────────────────────────

function buildFlowRows(): SheetMatrix {
  const rows: SheetMatrix = [['from', 'type', 'choice_prompt', 'label', 'to']];
  for (let n = 1; n <= 9; n++) rows.push([String(n), 'continue', '', '', String(n + 1)]);
  rows.push(['10', 'choice', PROMPT, DEFAULT_LABEL, 'truc_chinh.11']);
  rows.push(['10', 'choice', PROMPT, BRANCH_LABEL, 'nhanh_1.11']);
  for (let n = 11; n <= 14; n++) rows.push([`truc_chinh.${n}`, 'continue', '', '', `truc_chinh.${n + 1}`]);
  rows.push(['truc_chinh.15', 'continue', '', '', '16']);
  for (let n = 11; n <= 14; n++) rows.push([`nhanh_1.${n}`, 'continue', '', '', `nhanh_1.${n + 1}`]);
  rows.push(['nhanh_1.15', 'continue', '', '', '16']);
  rows.push(['16', 'end', '', '', 'END']);
  return rows;
}

export const FLOW_ROWS: SheetMatrix = buildFlowRows();

// ── Storyboard sheet ──────────────────────────────────────────────────────────

const DPS_BLOCKS = new Set([1, 4, 5, 6, 14, 16]);

type LaneKey = 'truc_chinh' | 'nhanh_1';
// 0=label, 1=tc-left, 2=tc-right, 3=n1-left, 4=n1-right
const LANE_COL: Record<LaneKey, { left: number; right: number }> = {
  truc_chinh: { left: 1, right: 2 },
  nhanh_1: { left: 3, right: 4 },
};

function blockRows(n: number, lanes: LaneKey[], dps: boolean): SheetMatrix {
  const headerExtra = `${dps ? ` ${DPS_MARKER}` : ''}${n === 10 ? ' [CHOICE]' : ''}`;
  const header: string[] = [`SPREAD ${n}${headerExtra}`, '', '', '', ''];

  const contentRow = (label: string, kind: 'dien' | 'stage' | 'loi' | 'art'): string[] => {
    const row: string[] = [label, '', '', '', ''];
    for (const lane of lanes) {
      const suffix = lane === 'nhanh_1' ? ' (nhánh 1)' : '';
      const fill = (side: 'TRÁI' | 'PHẢI') => {
        switch (kind) {
          case 'dien':
            return `Cảnh ${n}${suffix} ${side}`;
          case 'stage':
            return '@bedroom/base';
          case 'loi':
            return `Lời văn ${n}${suffix} ${side}`;
          case 'art':
            return `Góc máy ${n}${suffix} ${side}`;
        }
      };
      row[LANE_COL[lane].left] = fill('TRÁI');
      if (!dps) row[LANE_COL[lane].right] = fill('PHẢI');
    }
    return row;
  };

  return [
    header,
    contentRow(ROW_LABEL.DIEN_BIEN, 'dien'),
    contentRow(ROW_LABEL.STAGE, 'stage'),
    contentRow(ROW_LABEL.LOI_VAN, 'loi'),
    contentRow(ROW_LABEL.CHI_DAO, 'art'),
  ];
}

function buildStoryboardMatrix(): SheetMatrix {
  const rows: SheetMatrix = [];
  // Intro 1..10 — default lane only
  for (let n = 1; n <= 10; n++) rows.push(...blockRows(n, ['truc_chinh'], DPS_BLOCKS.has(n)));
  // Branch 11..15 — both lanes (1 storyboard block → 2 spreads)
  for (let n = 11; n <= 15; n++) rows.push(...blockRows(n, ['truc_chinh', 'nhanh_1'], DPS_BLOCKS.has(n)));
  // Ending 16 — default lane only
  rows.push(...blockRows(16, ['truc_chinh'], DPS_BLOCKS.has(16)));
  return rows;
}

export const STORYBOARD_MATRIX: SheetMatrix = buildStoryboardMatrix();

// ── Entity sheets (id | ref | <entity> key | variant | description) ───────────

const entityHeader = (key: string): string[] => ['id', 'ref', key, 'variant', 'description'];

function entityRow(key: string, variant: string, idx: number): string[] {
  return [`id-${idx}`, `@${key}/${variant}`, key, variant, `Mô tả ${key} ${variant}`];
}

function buildEntitySheet(header: string[], spec: Array<[string, string[]]>): SheetMatrix {
  const rows: SheetMatrix = [header];
  let i = 0;
  for (const [key, variants] of spec) {
    for (const v of variants) rows.push(entityRow(key, v, i++));
  }
  return rows;
}

// 7 characters, 15 rows
export const CHARACTERS_ROWS: SheetMatrix = buildEntitySheet(entityHeader('character'), [
  ['kid', ['base', 'hero']],
  ['daddy', ['base', 'fairy']],
  ['mommy', ['base', 'fairy', 'captive']],
  ['demon', ['base', 'god']],
  ['crane', ['base', 'animal']],
  ['granny', ['base', 'old']],
  ['fox', ['base', 'spirit']],
]);

// 6 props, 7 rows
export const PROPS_ROWS: SheetMatrix = buildEntitySheet(entityHeader('prop'), [
  ['crystal', ['base', 'glow']],
  ['lantern', ['base']],
  ['book', ['base']],
  ['bell', ['base']],
  ['feather', ['base']],
  ['rope', ['base']],
]);

// 8 stages, 11 rows (bedroom carries 'night' for stage_variant resolution + a base)
export const STAGES_ROWS: SheetMatrix = buildEntitySheet(entityHeader('stage'), [
  ['bedroom', ['base', 'night', 'day']],
  ['castle', ['base', 'corridor']],
  ['forest', ['base']],
  ['village', ['base']],
  ['river', ['base']],
  ['cave', ['base']],
  ['sky', ['base']],
  ['garden', ['base']],
]);

export const MODAL_META: ImportModalMeta = {
  title: 'Quỷ Màn Đêm',
  format_id: 'fmt-1',
  dimension: 1,
  target_audience: 1,
  artstyle_id: null,
  original_language: 'vi_VN',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Run the pure parse fns over the fixture → full intermediate model. */
export function buildFixtureParsed(): ParsedWorkbook {
  const warnings: string[] = [];
  const edges = parseFlow(FLOW_ROWS);
  const nodes = deriveNodes(edges);
  const cells = parseStoryboard(STORYBOARD_MATRIX, warnings);
  return {
    edges,
    nodes,
    cells,
    characters: parseEntitySheet(CHARACTERS_ROWS, 'character'),
    props: parseEntitySheet(PROPS_ROWS, 'prop'),
    stages: parseEntitySheet(STAGES_ROWS, 'stage'),
    warnings,
  };
}

/** Assembled snapshot from the fixture (default meta). */
export function buildFixtureSnapshot() {
  return assembleSnapshot(buildFixtureParsed(), MODAL_META);
}
