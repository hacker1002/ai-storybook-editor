// validate-import-snapshot.ts — Fail-fast collect-all validation (design spec §9).
// Gathers EVERY error before reporting (never throws on the first), so the modal
// can surface a complete list. Pure; no DB. Returns { errors, warnings }.

import { createLogger } from '@/utils/logger';
import { FLOW_END } from './import-script-constants';
import { canonNodeKey } from './parse-excel-workbook';
import type { ImportedSnapshot } from './build-snapshot-from-parsed';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import type { Stage } from '@/types/stage-types';
import type { ImportModalMeta, ParsedWorkbook } from './import-script-types';

const log = createLogger('Books', 'ValidateImport');

const LANG_RE = /^[a-z]{2}_[A-Z]{2}$/;
const REF_TOKEN_RE = /@([a-z0-9_]+)(?:\/([a-z0-9_]+))?/gi;
const STAGE_VARIANT_RE = /^@?([a-z0-9_]+)\/([a-z0-9_]+)$/i;

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

interface EntityLike {
  key: string;
  variants: { key: string; type: number }[];
}

/** Per-entity: unique variant keys (error), exactly one base (>1 = error, 0 = warn).
 *  0-base is advisory ("nên" §9) — stages like `bedroom: night+day` legitimately
 *  carry no base; >1 base is a real duplicate (always a doubled 'base' key). */
function checkEntityVariants(
  label: string,
  entities: EntityLike[],
  errors: string[],
  warnings: string[],
): void {
  for (const e of entities) {
    const seen = new Set<string>();
    for (const v of e.variants) {
      if (seen.has(v.key)) {
        errors.push(`${label} "${e.key}": variant "${v.key}" bị trùng`);
      }
      seen.add(v.key);
    }
    const baseCount = e.variants.filter((v) => v.type === 0).length;
    if (baseCount === 0) warnings.push(`${label} "${e.key}": không có variant "base"`);
    else if (baseCount > 1) errors.push(`${label} "${e.key}": có ${baseCount} variant "base" (chỉ được 1)`);
  }
}

function collectKnownKeys(snapshot: ImportedSnapshot): Set<string> {
  const keys = new Set<string>();
  const add = (entities: { key: string; variants: { key: string }[] }[]) => {
    for (const e of entities) {
      keys.add(e.key);
      for (const v of e.variants) keys.add(v.key);
    }
  };
  add(snapshot.characters as Character[]);
  add(snapshot.props as Prop[]);
  add(snapshot.stages as Stage[]);
  return keys;
}

export function validateImportSnapshot(
  snapshot: ImportedSnapshot,
  parsed: ParsedWorkbook,
  meta: ImportModalMeta,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [...parsed.warnings];

  // 1. Flow node ↔ Storyboard cell bijection — joined by canonical (lane, number),
  //    NOT raw node_id (the default lane appears both bare and prefixed).
  const nodeCanon = new Map(parsed.nodes.map((n) => [canonNodeKey(n.lane, n.spread_number), n.node_id] as const));
  const cellCanon = new Map(parsed.cells.map((c) => [canonNodeKey(c.lane, c.spread_number), c.node_id] as const));
  for (const [canon, id] of nodeCanon) {
    if (!cellCanon.has(canon)) errors.push(`Node Flow "${id}" thiếu nội dung trong Storyboard`);
  }
  for (const [canon, id] of cellCanon) {
    if (!nodeCanon.has(canon)) errors.push(`Storyboard "${id}" không có node tương ứng trong Flow`);
  }

  // 2. Every choice.to resolves to an existing node.
  const nodeIds = new Set(parsed.nodes.map((n) => n.node_id));
  for (const e of parsed.edges) {
    if (e.type === 'choice' && !nodeIds.has(e.to)) {
      errors.push(`Choice trỏ tới node không tồn tại: "${e.to}"`);
    }
  }

  // 3. Every node has ≥1 out-edge (ending nodes carry a type='end'/→END edge).
  const fromSet = new Set(parsed.edges.map((e) => e.from));
  for (const n of parsed.nodes) {
    if (!fromSet.has(n.node_id)) {
      errors.push(`Node "${n.node_id}" không có edge ra (dead-end)`);
    }
  }
  // also: any `to` (non-END) must be a known node
  for (const e of parsed.edges) {
    if (e.to && e.to.toUpperCase() !== FLOW_END && !nodeIds.has(e.to)) {
      errors.push(`Edge trỏ tới node không tồn tại: "${e.from}" → "${e.to}"`);
    }
  }

  // 4. Language code + narration presence.
  if (!LANG_RE.test(meta.original_language)) {
    errors.push(`original_language không hợp lệ: "${meta.original_language}"`);
  }
  const hasNarration = parsed.cells.some((c) => c.pages.some((p) => Boolean(p.loi_van)));
  if (parsed.cells.length > 0 && !hasNarration) {
    warnings.push('Không tìm thấy "Lời văn" nào — narration sẽ trống');
  }

  // 5. Entity variant uniqueness + single base.
  checkEntityVariants('Character', snapshot.characters, errors, warnings);
  checkEntityVariants('Prop', snapshot.props, errors, warnings);
  checkEntityVariants('Stage', snapshot.stages, errors, warnings);

  // 6. stage_variant (@key/variant) must resolve to an existing stage variant → error.
  const stageIndex = new Map<string, Set<string>>();
  for (const s of snapshot.stages) {
    stageIndex.set(s.key, new Set(s.variants.map((v) => v.key)));
  }
  const danglingStage = new Set<string>();
  for (const spread of snapshot.illustration.spreads) {
    for (const img of spread.raw_images ?? []) {
      const sv = (img.stage_variant ?? '').trim();
      if (!sv || danglingStage.has(sv)) continue;
      const m = STAGE_VARIANT_RE.exec(sv);
      if (!m) {
        danglingStage.add(sv);
        errors.push(`stage_variant sai định dạng "@key/variant": "${sv}"`);
        continue;
      }
      const [, key, variant] = m;
      if (!stageIndex.get(key)?.has(variant)) {
        danglingStage.add(sv);
        errors.push(`stage_variant "${sv}" không khớp stage nào trong catalog`);
      }
    }
  }

  // Warn — @ref in prose descriptions that doesn't resolve (prompt-ref, non-blocking).
  const knownKeys = collectKnownKeys(snapshot);
  const warnedRefs = new Set<string>();
  const scanRefs = (text: string | undefined) => {
    if (!text) return;
    for (const m of text.matchAll(REF_TOKEN_RE)) {
      const key = m[1];
      if (!knownKeys.has(key) && !warnedRefs.has(key)) {
        warnedRefs.add(key);
        warnings.push(`@ref "@${key}" trong mô tả không khớp entity nào (prompt-ref)`);
      }
    }
  };
  for (const e of [...parsed.characters, ...parsed.props, ...parsed.stages]) scanRefs(e.description);
  for (const spread of snapshot.illustration.spreads) {
    for (const img of spread.raw_images ?? []) scanRefs(img.visual_description);
  }

  log.info('validateImportSnapshot', 'done', {
    errorCount: errors.length,
    warningCount: warnings.length,
  });
  return { errors, warnings };
}
