/**
 * Cross-batch `is_final` mutex selectors + reconciler (pure logic).
 *
 * - `resolveFinalCrops(remix)` — flat list of winner crops, 1 per `(spread_id,
 *   layer_id)` position. Defensive: picks highest `batch.order` if invariant
 *   breaks (>1 final for same key) and logs.error.
 * - `findUncoveredLayers(remix)` — positions with no winner. Inject Phase 3
 *   preflight: must be empty before applying.
 * - `reconcileOrphanFinals(mixes)` — pure mutation: returns a new mixes blob
 *   that re-claims orphan positions (R3: fallback highest `batch.order`) and
 *   defensively collapses duplicate finals. Idempotent — `changed=false`
 *   short-circuits before deep clone so consumers can skip persist.
 *
 * Reader contract: `is_final` is ONLY meaningful on crops whose container
 * `swap_results.is_selected=true`. History rows (`is_selected=false`) are
 * filtered before the invariant applies. Absent/undefined/false → unmarked.
 *
 * Use with `useMemo` / `useShallow` on stable raw refs (see store-store memory
 * `feedback_zustand_useshallow_nested_arrays`). Do NOT wrap the function ref
 * itself in useShallow.
 */

import type { Remix, RemixMix, SpreadTag } from '@/types/remix';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'RemixFinalSelectors');

export interface FinalCropEntry {
  spread_id: string;
  layer_id: string;
  media_url: string;
  geometry: { x: number; y: number; w: number; h: number };
  tags: SpreadTag[];
  batch_id: string;
}

export interface UncoveredLayer {
  spread_id: string;
  layer_id: string;
  /** Batches that have a crop matching this key but none is `is_final=true`.
   *  UI can surface as candidates for take-back. */
  candidate_batches: string[];
}

export interface ReconcileLog {
  /** Orphan positions claimed (no prior winner). */
  claimed: number;
  /** Duplicate-final losers collapsed. */
  defensiveCleared: number;
  /** Positions with no candidate at all (after delete). Should be 0 in practice. */
  dropped: number;
}

export interface ReconcileResult {
  mixes: RemixMix[];
  log: ReconcileLog;
  /** True iff at least one crop's `is_final` flips. Caller uses this to skip
   *  persist no-ops and avoid write loops. */
  changed: boolean;
}

interface CropRef {
  batchIdx: number;
  sheetIdx: number;
  swapResultIdx: number;
  cropIdx: number;
  order: number;
  batchId: string;
}

const makeKey = (spreadId: string, layerId: string) => `${spreadId}/${layerId}`;

/**
 * Tie-break: highest `batch.order`, secondary lex order on `batch.id` for
 * determinism when `order` is non-unique.
 */
function pickWinner<T extends { order: number; batchId: string }>(refs: T[]): T {
  return refs.reduce((best, current) => {
    if (current.order > best.order) return current;
    if (current.order === best.order && current.batchId < best.batchId) return current;
    return best;
  });
}

/**
 * Detect legacy remix data still missing the `is_final` flag. Returns true iff
 * there is at least one `swap_results[is_selected].crops[]` row with NO crop
 * carrying `is_final===true`. Pure / cheap — call in store entry-points to
 * gate a one-shot migration via `reconcileOrphanFinals`.
 *
 * False when:
 *   - mixes empty / no selected swap_result
 *   - every position with ≥1 candidate already has a winner
 *   - data is partially-flagged but invariant-broken (caller handles via
 *     `reconcileOrphanFinals`'s defensive cleanup — defensive needs an
 *     explicit user action like R3/R5; we do NOT defensive-heal here per
 *     Validation Session 1).
 */
export function needsMigration(mixes: RemixMix[] | null | undefined): boolean {
  if (!mixes) return false;
  for (const batch of mixes) {
    if (!batch?.crop_sheets) continue;
    for (const sheet of batch.crop_sheets) {
      const selected = sheet?.swap_results?.find((r) => r?.is_selected);
      if (!selected?.crops || selected.crops.length === 0) continue;
      const hasAnyFinal = selected.crops.some((c) => c?.is_final === true);
      if (!hasAnyFinal) return true;
    }
  }
  return false;
}

export function resolveFinalCrops(remix: Remix | null | undefined): FinalCropEntry[] {
  if (!remix) {
    log.debug('resolveFinalCrops', 'null remix, returning empty');
    return [];
  }
  const mixes = remix.mixes ?? [];
  log.info('resolveFinalCrops', 'entry', { mixCount: mixes.length });

  interface PendingEntry {
    entry: FinalCropEntry;
    order: number;
  }
  const result = new Map<string, PendingEntry>();
  let invariantBreaches = 0;

  for (const batch of mixes) {
    if (!batch?.crop_sheets) continue;
    for (const sheet of batch.crop_sheets) {
      const selected = sheet?.swap_results?.find((r) => r?.is_selected);
      if (!selected?.crops) continue;
      for (const crop of selected.crops) {
        if (crop?.is_final !== true) continue;
        const key = makeKey(crop.spread_id, crop.id);
        const existing = result.get(key);
        if (!existing) {
          result.set(key, {
            entry: {
              spread_id: crop.spread_id,
              layer_id: crop.id,
              media_url: crop.media_url,
              geometry: crop.geometry,
              tags: crop.tags,
              batch_id: batch.id,
            },
            order: batch.order,
          });
        } else {
          invariantBreaches += 1;
          // Defensive winner: highest order wins; lex tie-break on id.
          const challengerWins =
            batch.order > existing.order ||
            (batch.order === existing.order && batch.id < existing.entry.batch_id);
          if (challengerWins) {
            result.set(key, {
              entry: {
                spread_id: crop.spread_id,
                layer_id: crop.id,
                media_url: crop.media_url,
                geometry: crop.geometry,
                tags: crop.tags,
                batch_id: batch.id,
              },
              order: batch.order,
            });
          }
          log.warn('resolveFinalCrops', 'invariant breach (>1 final)', {
            key,
            challengerOrder: batch.order,
            challengerId: batch.id,
          });
        }
      }
    }
  }

  if (invariantBreaches > 0) {
    log.error('resolveFinalCrops', 'invariant breaches detected', {
      count: invariantBreaches,
    });
  }

  log.info('resolveFinalCrops', 'done', {
    finalCount: result.size,
    invariantBreaches,
  });
  return Array.from(result.values(), (v) => v.entry);
}

export function findUncoveredLayers(remix: Remix | null | undefined): UncoveredLayer[] {
  if (!remix) return [];
  const mixes = remix.mixes ?? [];
  log.info('findUncoveredLayers', 'entry', { mixCount: mixes.length });

  const allKeys = new Map<string, string[]>();
  for (const batch of mixes) {
    if (!batch?.crop_sheets) continue;
    for (const sheet of batch.crop_sheets) {
      const selected = sheet?.swap_results?.find((r) => r?.is_selected);
      if (!selected?.crops) continue;
      for (const crop of selected.crops) {
        const key = makeKey(crop.spread_id, crop.id);
        const batches = allKeys.get(key);
        if (batches) {
          if (!batches.includes(batch.id)) batches.push(batch.id);
        } else {
          allKeys.set(key, [batch.id]);
        }
      }
    }
  }

  const finalKeys = new Set(
    resolveFinalCrops(remix).map((e) => makeKey(e.spread_id, e.layer_id)),
  );

  const uncovered: UncoveredLayer[] = [];
  for (const [key, candidateBatches] of allKeys.entries()) {
    if (finalKeys.has(key)) continue;
    const sepIdx = key.indexOf('/');
    uncovered.push({
      spread_id: key.slice(0, sepIdx),
      layer_id: key.slice(sepIdx + 1),
      candidate_batches: candidateBatches,
    });
  }

  log.info('findUncoveredLayers', 'done', {
    allKeyCount: allKeys.size,
    uncoveredCount: uncovered.length,
  });
  return uncovered;
}

/**
 * Pure mutation helper for R5 take-back. Returns a fresh `mixes` blob with
 * `is_final=true` on the crop matching `(spreadId, layerId)` inside
 * `fromBatchId`, and `is_final=false` on every other batch's crop with the
 * same key. Returns `null` if `fromBatchId` or the target crop is missing —
 * caller surfaces as a guard miss.
 *
 * Mirrors backend `_promote_is_final_for_sheet` (R1) but scoped to a single
 * key chosen by the user; idempotent under repeated calls.
 */
export function applyTakeFinalBack(
  mixes: RemixMix[],
  spreadId: string,
  layerId: string,
  fromBatchId: string,
): RemixMix[] | null {
  const fromBatchIdx = mixes.findIndex((b) => b.id === fromBatchId);
  if (fromBatchIdx < 0) return null;

  let foundSheet = -1;
  let foundSwap = -1;
  let foundCrop = -1;
  const fromBatch = mixes[fromBatchIdx];
  outer: for (let si = 0; si < fromBatch.crop_sheets.length; si += 1) {
    const sheet = fromBatch.crop_sheets[si];
    const swapIdx = sheet.swap_results.findIndex((r) => r?.is_selected);
    if (swapIdx < 0) continue;
    const crops = sheet.swap_results[swapIdx]?.crops ?? [];
    for (let ci = 0; ci < crops.length; ci += 1) {
      const crop = crops[ci];
      if (crop.spread_id === spreadId && crop.id === layerId) {
        foundSheet = si;
        foundSwap = swapIdx;
        foundCrop = ci;
        break outer;
      }
    }
  }
  if (foundCrop < 0) return null;

  const cloned = structuredClone(mixes);
  cloned[fromBatchIdx].crop_sheets[foundSheet].swap_results[foundSwap].crops[
    foundCrop
  ].is_final = true;
  for (let bi = 0; bi < cloned.length; bi += 1) {
    if (bi === fromBatchIdx) continue;
    for (const sheet of cloned[bi].crop_sheets) {
      for (const result of sheet.swap_results) {
        for (const crop of result.crops) {
          if (
            crop.spread_id === spreadId &&
            crop.id === layerId &&
            crop.is_final
          ) {
            crop.is_final = false;
          }
        }
      }
    }
  }
  return cloned;
}

export function reconcileOrphanFinals(mixes: RemixMix[] | null | undefined): ReconcileResult {
  const safeMixes = mixes ?? [];
  log.info('reconcileOrphanFinals', 'entry', { mixCount: safeMixes.length });

  const key2finals = new Map<string, CropRef[]>();
  const key2candidates = new Map<string, CropRef[]>();

  for (let bi = 0; bi < safeMixes.length; bi += 1) {
    const batch = safeMixes[bi];
    if (!batch?.crop_sheets) continue;
    for (let si = 0; si < batch.crop_sheets.length; si += 1) {
      const sheet = batch.crop_sheets[si];
      const selectedIdx = sheet?.swap_results?.findIndex((r) => r?.is_selected) ?? -1;
      if (selectedIdx < 0) continue;
      const selected = sheet.swap_results[selectedIdx];
      const crops = selected?.crops ?? [];
      for (let ci = 0; ci < crops.length; ci += 1) {
        const crop = crops[ci];
        if (!crop) continue;
        const key = makeKey(crop.spread_id, crop.id);
        const ref: CropRef = {
          batchIdx: bi,
          sheetIdx: si,
          swapResultIdx: selectedIdx,
          cropIdx: ci,
          order: batch.order,
          batchId: batch.id,
        };
        const candList = key2candidates.get(key);
        if (candList) candList.push(ref);
        else key2candidates.set(key, [ref]);
        if (crop.is_final === true) {
          const finList = key2finals.get(key);
          if (finList) finList.push(ref);
          else key2finals.set(key, [ref]);
        }
      }
    }
  }

  interface Decision {
    winnerRef: CropRef;
    defensiveLosers: CropRef[];
  }
  const decisions = new Map<string, Decision>();
  let defensiveCleared = 0;

  for (const [key, finals] of key2finals.entries()) {
    if (finals.length === 1) {
      decisions.set(key, { winnerRef: finals[0], defensiveLosers: [] });
    } else {
      const winner = pickWinner(finals);
      const losers = finals.filter((f) => f !== winner);
      decisions.set(key, { winnerRef: winner, defensiveLosers: losers });
      defensiveCleared += losers.length;
      log.warn('reconcileOrphanFinals', 'multi-winner cleared', {
        key,
        winnerOrder: winner.order,
        loserCount: losers.length,
      });
    }
  }

  let claimed = 0;
  let dropped = 0;
  for (const [key, candidates] of key2candidates.entries()) {
    if (decisions.has(key)) continue;
    if (candidates.length === 0) {
      dropped += 1;
      continue;
    }
    const winner = pickWinner(candidates);
    decisions.set(key, { winnerRef: winner, defensiveLosers: [] });
    claimed += 1;
  }

  // Change detection: walk every candidate, compare current `is_final` against
  // the expected post-reconcile value. Bail at first mismatch.
  let changed = false;
  for (const [key, candidates] of key2candidates.entries()) {
    const decision = decisions.get(key);
    if (!decision) continue;
    for (const cand of candidates) {
      const crop =
        safeMixes[cand.batchIdx].crop_sheets[cand.sheetIdx].swap_results[cand.swapResultIdx]
          .crops[cand.cropIdx];
      const isWinner =
        cand.batchIdx === decision.winnerRef.batchIdx &&
        cand.sheetIdx === decision.winnerRef.sheetIdx &&
        cand.swapResultIdx === decision.winnerRef.swapResultIdx &&
        cand.cropIdx === decision.winnerRef.cropIdx;
      const current = crop.is_final === true;
      if (current !== isWinner) {
        changed = true;
        break;
      }
    }
    if (changed) break;
  }

  if (!changed) {
    log.debug('reconcileOrphanFinals', 'no-op', { claimed: 0, defensiveCleared: 0, dropped });
    return {
      mixes: safeMixes,
      log: { claimed: 0, defensiveCleared: 0, dropped },
      changed: false,
    };
  }

  const cloned = structuredClone(safeMixes);
  for (const [key, candidates] of key2candidates.entries()) {
    const decision = decisions.get(key);
    if (!decision) continue;
    for (const cand of candidates) {
      const crop =
        cloned[cand.batchIdx].crop_sheets[cand.sheetIdx].swap_results[cand.swapResultIdx]
          .crops[cand.cropIdx];
      const isWinner =
        cand.batchIdx === decision.winnerRef.batchIdx &&
        cand.sheetIdx === decision.winnerRef.sheetIdx &&
        cand.swapResultIdx === decision.winnerRef.swapResultIdx &&
        cand.cropIdx === decision.winnerRef.cropIdx;
      crop.is_final = isWinner;
    }
  }

  log.info('reconcileOrphanFinals', 'done', { claimed, defensiveCleared, dropped, changed });
  return {
    mixes: cloned,
    log: { claimed, defensiveCleared, dropped },
    changed: true,
  };
}
