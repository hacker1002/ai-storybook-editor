// parse-excel-workbook.ts — Excel → intermediate parse model (design spec §2,
// §4.1, §4.4, §5). Pure functions operate on already-extracted sheet matrices so
// they unit-test without SheetJS; only `parseExcel` touches the (lazy-imported)
// xlsx runtime. No snapshot building here (see build-snapshot-from-parsed.ts).

import { createLogger } from '@/utils/logger';
import {
  DEFAULT_LANE,
  DPS_MARKER,
  LANE_COLUMNS,
  NODE_ID_RE,
  ROW_LABEL,
  SHEET,
  SPREAD_HEADER_RE,
  FLOW_END,
} from './import-script-constants';
import type {
  Lane,
  ParsedEntityRow,
  ParsedFlowEdge,
  ParsedNode,
  ParsedPageCell,
  ParsedSpreadCell,
  ParsedWorkbook,
} from './import-script-types';

const log = createLogger('Books', 'ParseExcelWorkbook');

/** Raw cell value as produced by `sheet_to_json(header:1)`. */
type Cell = string | number | boolean | null | undefined;
/** A sheet as a row-major matrix (row 0 = header / first row). */
export type SheetMatrix = Cell[][];

/** Coerce a raw cell to a trimmed string ('' when blank). */
function cellStr(v: Cell): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** '' → undefined so downstream never builds empty layers. */
function orUndef(s: string): string | undefined {
  return s.length > 0 ? s : undefined;
}

/** Build a node id from lane + spread number (inverse of parseNodeId). */
export function laneToNodeId(lane: Lane, n: number): string {
  return lane === DEFAULT_LANE ? String(n) : `${lane}.${n}`;
}

/**
 * Canonical join key — the AUTHORITATIVE identity of a spread (§4.1: join by
 * `(spread_number, lane)`). Flow node-id strings are NOT canonical: the default
 * lane appears both bare (`'11'`) and prefixed (`'truc_chinh.11'`) for the same
 * (lane, number). Always join cells↔nodes through this, never raw node_id.
 */
export function canonNodeKey(lane: Lane, n: number): string {
  return `${lane}#${n}`;
}

/** Parse a node id → lane + spread number, or null when malformed. */
export function parseNodeId(id: string): { lane: Lane; n: number } | null {
  const m = NODE_ID_RE.exec(id.trim());
  if (!m?.groups) return null;
  const lane = (m.groups.lane ?? DEFAULT_LANE) as Lane;
  const n = Number(m.groups.n);
  if (!Number.isFinite(n)) return null;
  return { lane, n };
}

// ── Flow ──────────────────────────────────────────────────────────────────────

const FLOW_COLUMNS = ['from', 'type', 'choice_prompt', 'label', 'to'] as const;
type FlowColumn = (typeof FLOW_COLUMNS)[number];

/** Resolve Flow column indices by header name (robust to reorder), else positional. */
function resolveFlowColumns(header: Cell[]): Record<FlowColumn, number> {
  const normalized = header.map((h) => cellStr(h).toLowerCase());
  const idx = {} as Record<FlowColumn, number>;
  FLOW_COLUMNS.forEach((col, i) => {
    const found = normalized.indexOf(col);
    idx[col] = found >= 0 ? found : i;
  });
  return idx;
}

export function parseFlow(matrix: SheetMatrix): ParsedFlowEdge[] {
  if (matrix.length === 0) return [];
  const cols = resolveFlowColumns(matrix[0]);
  const edges: ParsedFlowEdge[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const from = cellStr(row[cols.from]);
    if (!from) continue; // skip blank rows
    const rawType = cellStr(row[cols.type]).toLowerCase();
    const type: ParsedFlowEdge['type'] =
      rawType === 'choice' || rawType === 'end' ? rawType : 'continue';
    edges.push({
      from,
      type,
      to: cellStr(row[cols.to]),
      choice_prompt: orUndef(cellStr(row[cols.choice_prompt])),
      label: orUndef(cellStr(row[cols.label])),
    });
  }

  log.info('parseFlow', 'done', { edgeCount: edges.length });
  return edges;
}

/** Distinct Flow nodes (from + to, minus END), resolved to lane + number.
 *  Deduped by CANONICAL (lane, number) — not raw string — so a workbook mixing
 *  bare (`'11'`) and prefixed (`'truc_chinh.11'`) ids for the same spread yields a
 *  single node (else two spreads would clone one storyboard cell). First-seen id wins. */
export function deriveNodes(edges: ParsedFlowEdge[]): ParsedNode[] {
  const seen = new Set<string>();
  const nodes: ParsedNode[] = [];
  const consider = (raw: string) => {
    const id = raw.trim();
    if (!id || id.toUpperCase() === FLOW_END) return;
    const parsed = parseNodeId(id);
    if (!parsed) {
      log.warn('deriveNodes', 'unparseable node id, skipping', { id });
      return;
    }
    const canon = canonNodeKey(parsed.lane, parsed.n);
    if (seen.has(canon)) return;
    seen.add(canon);
    nodes.push({ node_id: id, spread_number: parsed.n, lane: parsed.lane });
  };
  for (const e of edges) {
    consider(e.from);
    consider(e.to);
  }
  log.info('deriveNodes', 'done', { nodeCount: nodes.length });
  return nodes;
}

// ── Storyboard ──────────────────────────────────────────────────────────────

/** Normalized label → ROW_LABEL key lookup (trim + lowercase). */
const CONTENT_LABELS: Record<string, keyof typeof ROW_LABEL> = {
  [ROW_LABEL.DIEN_BIEN.toLowerCase()]: 'DIEN_BIEN',
  [ROW_LABEL.STAGE.toLowerCase()]: 'STAGE',
  [ROW_LABEL.LOI_VAN.toLowerCase()]: 'LOI_VAN',
  [ROW_LABEL.CHI_DAO.toLowerCase()]: 'CHI_DAO',
};

type ContentRows = Partial<Record<keyof typeof ROW_LABEL, Cell[]>>;

interface OpenBlock {
  number: number;
  isDps: boolean;
  rows: ContentRows;
}

function readPageCell(rows: ContentRows, col: number): ParsedPageCell {
  return {
    dien_bien: orUndef(cellStr(rows.DIEN_BIEN?.[col])),
    stage_ref: orUndef(cellStr(rows.STAGE?.[col])),
    loi_van: orUndef(cellStr(rows.LOI_VAN?.[col])),
    chi_dao_hinh_anh: orUndef(cellStr(rows.CHI_DAO?.[col])),
  };
}

/** True when any of the 4 content rows has data at the given column. */
function columnHasData(rows: ContentRows, col: number): boolean {
  return (
    cellStr(rows.DIEN_BIEN?.[col]).length > 0 ||
    cellStr(rows.STAGE?.[col]).length > 0 ||
    cellStr(rows.LOI_VAN?.[col]).length > 0 ||
    cellStr(rows.CHI_DAO?.[col]).length > 0
  );
}

function flushBlock(
  block: OpenBlock,
  out: ParsedSpreadCell[],
  warnings: string[],
): void {
  for (const laneKey of Object.keys(LANE_COLUMNS) as Lane[]) {
    const { left, right } = LANE_COLUMNS[laneKey];
    const present = columnHasData(block.rows, left) || columnHasData(block.rows, right);
    if (!present) continue;

    const node_id = laneToNodeId(laneKey, block.number);
    if (block.isDps) {
      if (columnHasData(block.rows, right)) {
        warnings.push(
          `SPREAD ${block.number} (${laneKey}): trang đôi nhưng cột PHẢI có nội dung — ưu tiên cột TRÁI`,
        );
        log.warn('parseStoryboard', 'DPS right column had content', {
          spread: block.number,
          lane: laneKey,
        });
      }
      out.push({
        node_id,
        spread_number: block.number,
        lane: laneKey,
        is_dps: true,
        pages: [readPageCell(block.rows, left)],
      });
    } else {
      out.push({
        node_id,
        spread_number: block.number,
        lane: laneKey,
        is_dps: false,
        pages: [readPageCell(block.rows, left), readPageCell(block.rows, right)],
      });
    }
  }
}

/** Scan the Storyboard matrix block-by-block → one cell per (spread, lane present). */
export function parseStoryboard(matrix: SheetMatrix, warnings: string[]): ParsedSpreadCell[] {
  const cells: ParsedSpreadCell[] = [];
  let block: OpenBlock | null = null;

  for (const row of matrix) {
    const label = cellStr(row[0]);
    const headerMatch = SPREAD_HEADER_RE.exec(label);

    if (headerMatch) {
      if (block) flushBlock(block, cells, warnings);
      const headerText = row.map(cellStr).join(' ').toUpperCase();
      block = {
        number: Number(headerMatch[1]),
        isDps: headerText.includes(DPS_MARKER.toUpperCase()),
        rows: {},
      };
      continue;
    }

    if (!block) continue;
    const labelKey = CONTENT_LABELS[label.toLowerCase()];
    if (labelKey) block.rows[labelKey] = row;
  }
  if (block) flushBlock(block, cells, warnings);

  log.info('parseStoryboard', 'done', { cellCount: cells.length, warningCount: warnings.length });
  return cells;
}

// ── Entity sheets ─────────────────────────────────────────────────────────────

// Columns (positional, per §2.3): id | ref | <entity>(key) | variant | description
const ENTITY_COL = { ref: 1, key: 2, variant: 3, description: 4 } as const;

export function parseEntitySheet(
  matrix: SheetMatrix,
  entity_type: ParsedEntityRow['entity_type'],
): ParsedEntityRow[] {
  const rows: ParsedEntityRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const key = cellStr(row[ENTITY_COL.key]);
    if (!key) continue; // skip header-ish / blank rows
    rows.push({
      entity_type,
      key,
      variant_key: cellStr(row[ENTITY_COL.variant]) || 'base',
      ref: cellStr(row[ENTITY_COL.ref]),
      description: cellStr(row[ENTITY_COL.description]),
    });
  }
  return rows;
}

// ── Workbook orchestration (lazy SheetJS) ─────────────────────────────────────

/** Read a workbook from a File and produce the full intermediate model.
 *  Lazy `import('xlsx')` keeps SheetJS out of the books bundle until submit. */
export async function parseExcel(file: File): Promise<ParsedWorkbook> {
  log.info('parseExcel', 'start', { fileName: file.name, size: file.size });
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });

  const matrixOf = (name: string): SheetMatrix => {
    const sheet = wb.Sheets[name];
    if (!sheet) throw new Error(`Thiếu sheet "${name}" trong file Excel`);
    return XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as unknown as SheetMatrix;
  };

  const warnings: string[] = [];
  const edges = parseFlow(matrixOf(SHEET.FLOW));
  const nodes = deriveNodes(edges);
  const cells = parseStoryboard(matrixOf(SHEET.STORYBOARD), warnings);
  const characters = parseEntitySheet(matrixOf(SHEET.CHARACTERS), 'character');
  const props = parseEntitySheet(matrixOf(SHEET.PROPS), 'prop');
  const stages = parseEntitySheet(matrixOf(SHEET.STAGES), 'stage');

  log.info('parseExcel', 'done', {
    edges: edges.length,
    nodes: nodes.length,
    cells: cells.length,
    characters: characters.length,
    props: props.length,
    stages: stages.length,
  });
  return { edges, nodes, cells, characters, props, stages, warnings };
}
