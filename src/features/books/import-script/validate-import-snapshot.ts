// validate-import-snapshot.ts — Fail-fast collect-all validation for the SKETCH import
// (design 07-01 §9). Gathers EVERY error before reporting (never throws on the first),
// so the modal can surface a complete list. Pure; no DB. Seeded with the spread-parse
// issues so structural warnings/errors from the shared parser flow through.

import { createLogger } from '@/utils/logger';
import type { Character } from '@/types/character-types';
import type { Prop } from '@/types/prop-types';
import type { Stage } from '@/types/stage-types';
import { getSketchTextboxContent } from '@/types/sketch';
import type { ArtDirection } from '@/types/sketch';
import type { ImportModalMeta } from './import-script-types';
import type { ImportedWorkbook } from './parse-excel-workbook';
import type { ImportedSketchSnapshot } from './build-snapshot-from-parsed';
import type { ImportIssues } from './sketch-spread-excel.types';

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

/** Per-entity: unique variant keys (error), exactly one base (>1 = error, 0 = warn). */
function checkEntityVariants(
  label: string,
  entities: EntityLike[],
  errors: string[],
  warnings: string[],
): void {
  for (const e of entities) {
    const seen = new Set<string>();
    for (const v of e.variants) {
      if (seen.has(v.key)) errors.push(`${label} "${e.key}": variant "${v.key}" bị trùng`);
      seen.add(v.key);
    }
    const baseCount = e.variants.filter((v) => v.type === 0).length;
    if (baseCount === 0) warnings.push(`${label} "${e.key}": không có variant "base"`);
    else if (baseCount > 1) errors.push(`${label} "${e.key}": có ${baseCount} variant "base" (chỉ được 1)`);
  }
}

function collectKnownKeys(snapshot: ImportedSketchSnapshot): Set<string> {
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

/** art_direction field values (excluding `stage`, which step 4 validates on its own) for
 *  @ref scanning — avoids double-reporting a dangling stage as both error + warning. */
function artDirectionProseValues(ad: ArtDirection): string[] {
  return Object.entries(ad)
    .filter(([k, v]) => k !== 'stage' && typeof v === 'string')
    .map(([, v]) => v as string);
}

export function validateSketchImport(
  snapshot: ImportedSketchSnapshot,
  parsed: ImportedWorkbook,
  meta: ImportModalMeta,
  seed: ImportIssues,
): ValidationResult {
  const errors: string[] = [...seed.errors];
  const warnings: string[] = [...seed.warnings];

  // 1. Language code validity.
  if (!LANG_RE.test(meta.original_language)) {
    errors.push(`original_language không hợp lệ: "${meta.original_language}"`);
  }

  // 2. Narration presence — any textbox in any spread carrying any language content.
  const hasNarration = snapshot.sketch.spreads.some((spread) =>
    spread.textboxes.some((tb) => Object.keys(tb).some((k) => k !== 'id' && getSketchTextboxContent(tb, k))),
  );
  if (snapshot.sketch.spreads.length > 0 && !hasNarration) {
    warnings.push('Không tìm thấy "Lời văn" nào — narration sẽ trống');
  }

  // 3. Entity variant uniqueness + single base.
  checkEntityVariants('Character', snapshot.characters, errors, warnings);
  checkEntityVariants('Prop', snapshot.props, errors, warnings);
  checkEntityVariants('Stage', snapshot.stages, errors, warnings);

  // 4. art_direction.stage: an @-ref MUST resolve to a catalog stage variant → error if
  //    dangling/malformed (spec 07-01 §9). A non-@ value (author prose) is advisory only —
  //    it never blocks the import (the Stage row is conventionally an @key/variant ref).
  const stageIndex = new Map<string, Set<string>>();
  for (const s of snapshot.stages) stageIndex.set(s.key, new Set(s.variants.map((v) => v.key)));
  const seenStage = new Set<string>();
  for (const spread of snapshot.sketch.spreads) {
    for (const page of spread.pages) {
      const sv = (page.art_direction.stage ?? '').trim();
      if (!sv || seenStage.has(sv)) continue;
      seenStage.add(sv);
      if (!sv.startsWith('@')) {
        warnings.push(`stage "${sv}" không phải @ref entity (không chặn import)`);
        continue;
      }
      const m = STAGE_VARIANT_RE.exec(sv);
      if (!m) {
        errors.push(`stage sai định dạng "@key/variant": "${sv}"`);
        continue;
      }
      const [, key, variant] = m;
      if (!stageIndex.get(key)?.has(variant)) {
        errors.push(`stage "${sv}" không khớp stage nào trong catalog`);
      }
    }
  }

  // 5. Warn — @ref in prose (entity descriptions + art_direction fields) that doesn't resolve.
  const knownKeys = collectKnownKeys(snapshot);
  const warnedRefs = new Set<string>();
  const scanRefs = (text: string | undefined) => {
    if (!text) return;
    for (const m of text.matchAll(REF_TOKEN_RE)) {
      const key = m[1];
      if (!knownKeys.has(key) && !warnedRefs.has(key)) {
        warnedRefs.add(key);
        warnings.push(`@ref "@${key}" không khớp entity nào (prompt-ref)`);
      }
    }
  };
  for (const e of [...parsed.characters, ...parsed.props, ...parsed.stages]) scanRefs(e.description);
  for (const spread of snapshot.sketch.spreads) {
    for (const page of spread.pages) {
      for (const value of artDirectionProseValues(page.art_direction)) scanRefs(value);
    }
  }

  log.info('validateSketchImport', 'done', {
    errorCount: errors.length,
    warningCount: warnings.length,
  });
  return { errors, warnings };
}
