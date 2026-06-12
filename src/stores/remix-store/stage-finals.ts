// stage-finals.ts — Stage-pipeline finals helpers (⚡2026-06-12, design
// remix-store.md §2 + 05-05 §6.5 + 05-14).
//
// A stage's FINALS are the winner crops of its column:
//   remix[stage][].crop_sheets[].swap_results[is_selected].crops[is_final]
// joined with `original_crops[]` of the SAME sheet by `(spread_id, id)` for
// tags + the layout-dim estimate (lean swap crops carry no geometry/tags).
//
// Consumers: ImportBatchModal list (`useStageFinals`), Import gating, and
// `buildStageBatchInput` (engine input for `importStageBatch` — native-px
// pieces, packed with `absolutePx: true`).
//
// SECURITY: never log media_url (crops are PII likenesses) — keys/counts only.

import { createLogger } from '@/utils/logger';
import type { Remix, SpreadTag, StageKind } from '@/types/remix';
import type { CropInput } from '@/utils/crop-sheet-layout-engine';

const log = createLogger('Store', 'StageFinals');

/** One stage final, ready for the Import dialog + the layout engine.
 *  `spread_id`/`id` are kept RAW (buildStageBatchInput reads them directly —
 *  never parse `cropKey`). `nativeDim` = the original crop's layout box (w/h)
 *  — a layout ESTIMATE only (the composer rescales defensively). */
export interface ImportFinalEntry {
  cropKey: string; // `${spread_id}/${id}` — tick key (05-14)
  spread_id: string;
  id: string;
  media_url: string; // output piece of the source stage (swapped / RGBA)
  tags: SpreadTag[]; // joined lean from original_crops[]
  nativeDim: { w: number; h: number };
  sourceBatch: { id: string; name: string; order: number };
}

/**
 * Collect the finals of ONE stage column (winner mutex per-stage).
 *
 * Walks `remix[stage]` in batch order; for every sheet takes the selected
 * swap_result's `is_final` crops and joins `original_crops[]` by
 * `(spread_id, id)`. Orphans (no matching original) are SKIPPED with a warn.
 *
 * Defensive dedup by cropKey: the per-stage winner mutex guarantees uniqueness
 * at steady state, but dev data may not be steady — the entry from the batch
 * with the HIGHEST `order` wins (lex tie-break on id), duplicates are dropped
 * with a warn (never silently corrupt).
 */
export function collectStageFinals(
  remix: Remix | null | undefined,
  stage: StageKind,
): ImportFinalEntry[] {
  if (!remix) return [];
  const rows = remix[stage] ?? [];
  const byKey = new Map<string, ImportFinalEntry>();
  let dupes = 0;
  let orphans = 0;

  for (const batch of rows) {
    for (const sheet of batch.crop_sheets ?? []) {
      const selected = sheet.swap_results?.find((r) => r?.is_selected);
      if (!selected?.crops) continue;
      for (const crop of selected.crops) {
        if (crop?.is_final !== true) continue;
        const original = sheet.original_crops?.find(
          (o) => o.spread_id === crop.spread_id && o.id === crop.id,
        );
        if (!original) {
          orphans += 1;
          log.warn('collectStageFinals', 'orphan final crop — skip', {
            stage,
            spreadId: crop.spread_id,
            id: crop.id,
          });
          continue;
        }
        const cropKey = `${crop.spread_id}/${crop.id}`;
        const entry: ImportFinalEntry = {
          cropKey,
          spread_id: crop.spread_id,
          id: crop.id,
          media_url: crop.media_url,
          tags: original.tags ?? [],
          nativeDim: { w: original.geometry.w, h: original.geometry.h },
          sourceBatch: { id: batch.id, name: batch.name, order: batch.order },
        };
        const existing = byKey.get(cropKey);
        if (!existing) {
          byKey.set(cropKey, entry);
          continue;
        }
        dupes += 1;
        const challengerWins =
          batch.order > existing.sourceBatch.order ||
          (batch.order === existing.sourceBatch.order &&
            batch.id < existing.sourceBatch.id);
        if (challengerWins) byKey.set(cropKey, entry);
        log.warn('collectStageFinals', 'duplicate final (invariant breach)', {
          stage,
          cropKey,
          keptOrder: challengerWins ? batch.order : existing.sourceBatch.order,
        });
      }
    }
  }

  const finals = [...byKey.values()];
  log.debug('collectStageFinals', 'done', {
    stage,
    batchCount: rows.length,
    finalCount: finals.length,
    dupes,
    orphans,
  });
  return finals;
}

/**
 * Build the layout-engine input for an IMPORTED batch (stage 2/3) from a
 * selection of the previous stage's finals (design 05-05 §6.5).
 *
 * Dims are the NATIVE-piece estimate (`nativeDim` = previous stage's layout
 * box) in ABSOLUTE px — callers must pack with `absolutePx: true`. We never
 * fetch images to measure (composer rescales defensively).
 */
export function buildStageBatchInput(
  finals: ImportFinalEntry[],
  selectedFinalKeys: ReadonlySet<string>,
): { cropInputs: CropInput[]; selected: ImportFinalEntry[] } {
  const selected = finals.filter((f) => selectedFinalKeys.has(f.cropKey));
  const cropInputs: CropInput[] = selected.map((f) => ({
    id: f.id,
    widthPct: f.nativeDim.w, // absolute px under absolutePx:true
    heightPct: f.nativeDim.h,
    objectKey: f.tags[0]?.object_key,
  }));
  log.debug('buildStageBatchInput', 'mapped finals → engine input', {
    requested: selectedFinalKeys.size,
    matched: selected.length,
  });
  return { cropInputs, selected };
}
