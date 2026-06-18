// build-snapshot-from-parsed.ts — Intermediate parse model → typed snapshot
// object (design spec §3, §4.2, §4.3, §4.4, §5, §8). Pure & strongly typed; no DB.
// Geometry uses default rect constants (validated decision S1 option (b)).

import { newUuid } from '@/utils/uuid';
import { DEFAULT_TYPOGRAPHY } from '@/constants/config-constants';
import { mapTypographyToTextbox } from '@/constants/book-defaults';
import { createLogger } from '@/utils/logger';
import type {
  BaseSpread,
  Geometry,
  PageData,
  SpreadImage,
  SpreadTextbox,
  Typography,
} from '@/types/spread-types';
import type { BranchSetting, Branch, Section, IllustrationData } from '@/types/illustration-types';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import type { Stage } from '@/types/stage-types';
import type { ManuscriptDoc } from '@/types/editor';
import {
  DEFAULT_DPS_IMAGE_GEO,
  DEFAULT_DPS_TEXTBOX_GEO,
  DEFAULT_LANE,
  DEFAULT_LEFT_IMAGE_GEO,
  DEFAULT_LEFT_TEXTBOX_GEO,
  DEFAULT_PAGE_BACKGROUND,
  DEFAULT_RIGHT_IMAGE_GEO,
  DEFAULT_RIGHT_TEXTBOX_GEO,
  FLOW_END,
} from './import-script-constants';
import { renumberSpreadPages } from '@/utils/renumber-spread-pages';
import { canonNodeKey, parseNodeId } from './parse-excel-workbook';
import type {
  ImportModalMeta,
  ParsedEntityRow,
  ParsedFlowEdge,
  ParsedNode,
  ParsedPageCell,
  ParsedSpreadCell,
} from './import-script-types';

const log = createLogger('Books', 'BuildSnapshot');

/** Final assembled snapshot payload (subset written by createImportedBook). */
export interface ImportedSnapshot {
  docs: ManuscriptDoc[];
  illustration: IllustrationData;
  characters: Character[];
  props: Prop[];
  stages: Stage[];
}

const RAW_TYPOGRAPHY: Typography = mapTypographyToTextbox(DEFAULT_TYPOGRAPHY);

// ── String helpers ────────────────────────────────────────────────────────────

/** 'house_night' → 'House Night'. */
export function titlecase(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Flow ordering (graph traversal) ───────────────────────────────────────────

interface FlowGraph {
  out: Map<string, ParsedFlowEdge[]>;
  inSources: Map<string, string[]>;
}

function buildGraph(edges: ParsedFlowEdge[]): FlowGraph {
  const out = new Map<string, ParsedFlowEdge[]>();
  const inSources = new Map<string, string[]>();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from)!.push(e);
    if (e.to && e.to.toUpperCase() !== FLOW_END) {
      if (!inSources.has(e.to)) inSources.set(e.to, []);
      inSources.get(e.to)!.push(e.from);
    }
  }
  return { out, inSources };
}

/**
 * Order nodes so each branch is emitted fully before its merge node: linear DFS
 * that only emits a node once ALL its predecessors are emitted (merge nodes wait
 * for every branch). Edge order is the tiebreak → default lane first. Matches §8
 * (1..10, truc_chinh.11..15, nhanh_1.11..15, 16).
 */
export function flowOrder(nodes: ParsedNode[], edges: ParsedFlowEdge[]): ParsedNode[] {
  const byId = new Map(nodes.map((n) => [n.node_id, n] as const));
  const { out, inSources } = buildGraph(edges);
  const emitted = new Set<string>();
  const result: ParsedNode[] = [];

  const predsAllEmitted = (id: string): boolean =>
    (inSources.get(id) ?? []).every((src) => emitted.has(src));

  const visit = (id: string, force: boolean): void => {
    const node = byId.get(id);
    if (!node || emitted.has(id)) return;
    if (!force && !predsAllEmitted(id)) return;
    emitted.add(id);
    result.push(node);
    for (const e of out.get(id) ?? []) {
      if (e.to && e.to.toUpperCase() !== FLOW_END) visit(e.to, false);
    }
  };

  // Root = node with no incoming edges (fallback: first node).
  const root = nodes.find((n) => !inSources.has(n.node_id)) ?? nodes[0];
  if (root) visit(root.node_id, false);
  // Stragglers (disconnected components / malformed graphs) appended deterministically.
  for (const n of nodes) visit(n.node_id, true);

  log.info('flowOrder', 'done', { ordered: result.length, total: nodes.length });
  return result;
}

// ── Raw layer builders ────────────────────────────────────────────────────────

function buildRawImage(page: ParsedPageCell, geometry: Geometry): SpreadImage {
  return {
    id: newUuid(),
    geometry,
    'z-index': 0,
    player_visible: false,
    editor_visible: true,
    illustrations: [],
    image_references: [],
    // `Chỉ đạo hình ảnh` (camera/composition/lighting/palette/art-direction) is the
    // rich prompt material generate-scene consumes → visual_description. The brief
    // `Diễn biến` scene-beat note → art_note. (Corrects the original spec §6 mapping.)
    visual_description: page.chi_dao_hinh_anh ?? '',
    art_note: page.dien_bien ?? '',
    stage_variant: page.stage_ref ?? '',
  };
}

function buildRawTextbox(page: ParsedPageCell, geometry: Geometry, lang: string): SpreadTextbox {
  const tb: SpreadTextbox = {
    id: newUuid(),
    'z-index': 1,
    player_visible: false,
    editor_visible: true,
  };
  tb[lang] = { text: page.loi_van ?? '', geometry, typography: RAW_TYPOGRAPHY };
  return tb;
}

/** Placeholder page — `number` is overwritten by renumberSpreadPages once the
 *  full spread order is known (page numbers are global, not per-spread). */
function buildPage(): PageData {
  return {
    number: 0,
    type: 'normal_page',
    layout: null,
    background: { ...DEFAULT_PAGE_BACKGROUND },
  };
}

/** One Flow node + its storyboard cell → a typed BaseSpread (raw layers, no media). */
export function buildSpread(node: ParsedNode, cell: ParsedSpreadCell | undefined, lang: string): BaseSpread {
  const base = (): BaseSpread => ({
    id: newUuid(),
    pages: [],
    images: [],
    textboxes: [],
    raw_images: [],
    raw_textboxes: [],
    manuscript: '',
  });

  if (!cell) {
    log.warn('buildSpread', 'no storyboard cell for node (validation will flag)', {
      node_id: node.node_id,
    });
    return base();
  }

  const spread = base();
  if (cell.is_dps) {
    const page = cell.pages[0] ?? {};
    spread.pages = [buildPage()];
    spread.raw_images = [buildRawImage(page, DEFAULT_DPS_IMAGE_GEO)];
    spread.raw_textboxes = [buildRawTextbox(page, DEFAULT_DPS_TEXTBOX_GEO, lang)];
  } else {
    const left = cell.pages[0] ?? {};
    const right = cell.pages[1] ?? {};
    spread.pages = [buildPage(), buildPage()];
    spread.raw_images = [
      buildRawImage(left, DEFAULT_LEFT_IMAGE_GEO),
      buildRawImage(right, DEFAULT_RIGHT_IMAGE_GEO),
    ];
    spread.raw_textboxes = [
      buildRawTextbox(left, DEFAULT_LEFT_TEXTBOX_GEO, lang),
      buildRawTextbox(right, DEFAULT_RIGHT_TEXTBOX_GEO, lang),
    ];
  }
  spread.manuscript = cell.pages
    .map((p) => p.dien_bien)
    .filter((d): d is string => Boolean(d))
    .join('\n');
  return spread;
}

// ── Sections + branch_setting ─────────────────────────────────────────────────

export interface DerivedSections {
  sections: Section[];
  /** Branch start node_id → its section (for branch_setting wiring). */
  byStartNode: Map<string, Section>;
}

function laneOf(nodeId: string): string {
  return parseNodeId(nodeId)?.lane ?? DEFAULT_LANE;
}

/**
 * Branch sections (§4.2): for every choice target, a contiguous same-lane run from
 * the target until the next merge node (in-degree ≥ 2). `next_spread_id` = merge
 * node spread id (null when the run hits an ending edge).
 */
export function deriveSections(
  edges: ParsedFlowEdge[],
  idByNode: Map<string, string>,
): DerivedSections {
  const { out, inSources } = buildGraph(edges);
  const inDeg = (id: string): number => (inSources.get(id) ?? []).length;

  const sections: Section[] = [];
  const byStartNode = new Map<string, Section>();

  const choiceEdges = edges.filter((e) => e.type === 'choice');
  for (const ce of choiceEdges) {
    const start = ce.to;
    if (!idByNode.has(start) || byStartNode.has(start)) continue;

    let cur = start;
    let mergeNode: string | null = null;
    // Walk the linear continue chain until a merge node or an ending.
    // Guard against cycles with a visited set.
    const walked = new Set<string>([start]);
    for (;;) {
      const forward = (out.get(cur) ?? []).find((e) => e.type !== 'choice');
      if (!forward || !forward.to || forward.to.toUpperCase() === FLOW_END || forward.type === 'end') {
        break;
      }
      const next = forward.to;
      if (inDeg(next) >= 2) {
        mergeNode = next;
        break;
      }
      if (walked.has(next)) break;
      walked.add(next);
      cur = next;
    }

    const section: Section = {
      id: newUuid(),
      title: ce.label ?? '',
      start_spread_id: idByNode.get(start)!,
      end_spread_id: idByNode.get(cur)!,
      next_spread_id: mergeNode ? idByNode.get(mergeNode) ?? null : null,
    };
    sections.push(section);
    byStartNode.set(start, section);
  }

  log.info('deriveSections', 'done', { sectionCount: sections.length });
  return { sections, byStartNode };
}

export function isChoiceFrom(nodeId: string, edges: ParsedFlowEdge[]): boolean {
  return edges.some((e) => e.from === nodeId && e.type === 'choice');
}

/** branch_setting for a choice node (§4.2). Index-signature keys assigned dynamically. */
export function buildBranchSetting(
  choiceNodeId: string,
  edges: ParsedFlowEdge[],
  byStartNode: Map<string, Section>,
  lang: string,
): BranchSetting {
  const choiceEdges = edges.filter((e) => e.from === choiceNodeId && e.type === 'choice');
  const bs: BranchSetting = { branches: [] };
  bs[lang] = { title: choiceEdges[0]?.choice_prompt ?? '' };

  for (const ce of choiceEdges) {
    const section = byStartNode.get(ce.to);
    if (!section) {
      log.warn('buildBranchSetting', 'no section for branch target', { to: ce.to });
      continue;
    }
    const branch: Branch = {
      section_id: section.id,
      is_default: laneOf(ce.to) === DEFAULT_LANE,
    };
    branch[lang] = { title: ce.label ?? '' };
    bs.branches.push(branch);
  }
  return bs;
}

// ── Entity mappers ────────────────────────────────────────────────────────────

const emptyAppearance = () => ({ height: 0, hair: '', eyes: '', face: '', build: '' });
const emptyBasicInfo = () => ({ description: '', gender: '', age: '', category_id: '', role: '' });
const emptyPersonality = () => ({
  core_essence: '',
  flaws: '',
  emotions: '',
  reactions: '',
  desires: '',
  likes: '',
  fears: '',
  contradictions: '',
});
const emptyTemporal = () => ({ era: '', season: '', weather: '', time_of_day: '' });
const emptySensory = () => ({ atmosphere: '', soundscape: '', lighting: '', color_palette: '' });
const emptyEmotional = () => ({ mood: '' });

const variantType = (variantKey: string): 0 | 1 => (variantKey === 'base' ? 0 : 1);

/** Group rows by entity key, preserving first-appearance order. */
function groupByKey(rows: ParsedEntityRow[]): Map<string, ParsedEntityRow[]> {
  const groups = new Map<string, ParsedEntityRow[]>();
  for (const row of rows) {
    if (!groups.has(row.key)) groups.set(row.key, []);
    groups.get(row.key)!.push(row);
  }
  return groups;
}

export function buildCharacters(rows: ParsedEntityRow[]): Character[] {
  return Array.from(groupByKey(rows).entries()).map(([key, group], order) => ({
    order,
    name: titlecase(key),
    key,
    basic_info: emptyBasicInfo(),
    personality: emptyPersonality(),
    variants: group.map((row) => ({
      name: titlecase(row.variant_key),
      key: row.variant_key,
      type: variantType(row.variant_key),
      appearance: emptyAppearance(),
      visual_description: row.description,
      illustrations: [],
      image_references: [],
    })),
    voice_setting: null,
  }));
}

export function buildProps(rows: ParsedEntityRow[]): Prop[] {
  return Array.from(groupByKey(rows).entries()).map(([key, group], order) => ({
    order,
    name: titlecase(key),
    key,
    category_id: '',
    type: 'narrative' as const,
    variants: group.map((row) => ({
      name: titlecase(row.variant_key),
      key: row.variant_key,
      type: variantType(row.variant_key),
      visual_description: row.description,
      illustrations: [],
      image_references: [],
    })),
    sounds: [],
  }));
}

export function buildStages(rows: ParsedEntityRow[]): Stage[] {
  return Array.from(groupByKey(rows).entries()).map(([key, group], order) => ({
    order,
    name: titlecase(key),
    key,
    location_id: '',
    variants: group.map((row) => ({
      name: titlecase(row.variant_key),
      key: row.variant_key,
      type: variantType(row.variant_key),
      visual_description: row.description,
      temporal: emptyTemporal(),
      sensory: emptySensory(),
      emotional: emptyEmotional(),
      illustrations: [],
      image_references: [],
    })),
    sounds: [],
  }));
}

// ── Script doc ────────────────────────────────────────────────────────────────

/** One `type:'script'` doc reconstructed from Lời văn in default-flow order. */
export function buildScriptDoc(
  order: ParsedNode[],
  cellByCanon: Map<string, ParsedSpreadCell>,
  title: string,
): ManuscriptDoc {
  const content = order
    .map((node) => {
      const cell = cellByCanon.get(canonNodeKey(node.lane, node.spread_number));
      if (!cell) return '';
      return cell.pages
        .map((p) => p.loi_van)
        .filter((t): t is string => Boolean(t))
        .join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
  return { type: 'script', title: title || 'Script', content };
}

// ── Assemble ──────────────────────────────────────────────────────────────────

export function assembleSnapshot(
  parsed: {
    edges: ParsedFlowEdge[];
    nodes: ParsedNode[];
    cells: ParsedSpreadCell[];
    characters: ParsedEntityRow[];
    props: ParsedEntityRow[];
    stages: ParsedEntityRow[];
  },
  meta: ImportModalMeta,
): ImportedSnapshot {
  const lang = meta.original_language;
  const order = flowOrder(parsed.nodes, parsed.edges);
  // Join cells↔nodes by canonical (lane, number) — NOT raw node_id (see canonNodeKey).
  const cellByCanon = new Map(
    parsed.cells.map((c) => [canonNodeKey(c.lane, c.spread_number), c] as const),
  );

  const spreads: BaseSpread[] = [];
  const idByNode = new Map<string, string>();
  const spreadByNode = new Map<string, BaseSpread>();
  for (const node of order) {
    const cell = cellByCanon.get(canonNodeKey(node.lane, node.spread_number));
    const spread = buildSpread(node, cell, lang);
    spreads.push(spread);
    idByNode.set(node.node_id, spread.id);
    spreadByNode.set(node.node_id, spread);
  }

  // Page numbers are GLOBAL (sequential across the book), not per-spread — assign
  // them once now that spreads are in flow order, via the shared editor convention.
  renumberSpreadPages(spreads);

  const { sections, byStartNode } = deriveSections(parsed.edges, idByNode);

  for (const node of order) {
    if (isChoiceFrom(node.node_id, parsed.edges)) {
      const spread = spreadByNode.get(node.node_id);
      if (spread) {
        spread.branch_setting = buildBranchSetting(node.node_id, parsed.edges, byStartNode, lang);
      }
    }
  }

  const docs = [buildScriptDoc(order, cellByCanon, meta.title)];
  const characters = buildCharacters(parsed.characters);
  const props = buildProps(parsed.props);
  const stages = buildStages(parsed.stages);

  log.info('assembleSnapshot', 'done', {
    spreadCount: spreads.length,
    sectionCount: sections.length,
    characterCount: characters.length,
    propCount: props.length,
    stageCount: stages.length,
  });

  return { docs, illustration: { spreads, sections }, characters, props, stages };
}
