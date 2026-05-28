// crop-sheet-layout.ts — Client-side crop-sheet layout helpers for the remix
// store (rev2 — batch model). Two entry points:
//   - `computeCropSheets`   — runs at create time, mutates an insert payload IN
//     PLACE so `mixes[0].crop_sheets[]` (with geometry) lands in the same
//     INSERT. ONE batch, K=1 sheet, entity-affinity partition.
//   - `relayoutBatchSheets` — runs on append/remove sheet of a batch; re-groups
//     ALL crops from the (frozen) illustration via `groupCropsForBatch`, re-packs
//     at K±1 sheets, then persists via `patchRemixCropSheets({ kind:'replaceAll',
//     entityType:'mix', entityKey: batchId })` with optimistic rollback.
//
// Divergence note (Validation S1): post-create `crops[].geometry` is px
// sheet-relative (engine output) — it no longer carries source (%) geometry the
// engine needs. The illustration is frozen after create, so re-scan via
// `groupCropsForBatch` is the single source of truth. Same path as
// `computeCropSheets` → DRY.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type {
  InsertableRemixRow,
  Remix,
  RemixCropSheet,
} from '@/types/remix';
import {
  DIMENSION_CANVAS_SIZE,
  DEFAULT_CANVAS_SIZE,
} from '@/constants/canvas-dimension-constants';
import { computeCropSheetLayout } from '@/utils/crop-sheet-layout-engine';
import type { CropSheetLayoutResult } from '@/utils/crop-sheet-layout-engine';
import { groupCropsForBatch } from '@/utils/crop-grouping';
import type { CropEntry, RemixMix } from '@/types/remix';
import { makeBatchSkeleton } from './clone-builder';
import type { CropSheetUpdate } from './types';

/**
 * Returns the de-duplicated crops currently living in a batch (per-batch
 * scope — rev6). Reads ONLY the pre-swap `sheet.crops[]` lineup (never
 * `swap_results[].crops[]`, which is post-swap output). Dedup key
 * `(spread_id, id)` — a layer that ended up on multiple sheets of the same
 * batch collapses to one entry (first occurrence wins).
 *
 * Used by:
 *   - `addBatch` rev6 subset filter (selected crops ∈ active batch lineup).
 *   - `relayoutBatchSheets` per-batch scope (do NOT re-pull the full remix —
 *     subset batches carry a subset of the illustration's crops).
 */
export function currentCropsOfBatch(batch: RemixMix): CropEntry[] {
  const seen = new Set<string>();
  const out: CropEntry[] = [];
  for (const sheet of batch.crop_sheets) {
    for (const crop of sheet.crops) {
      const dedupKey = `${crop.spread_id}/${crop.id}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      out.push(crop);
    }
  }
  return out;
}

/** Minimum number of batches a remix must keep. The last batch cannot be
 *  removed (caller also hides the affordance). */
export const BATCH_MIN = 1;

const log = createLogger('Store', 'CropSheetLayout');

/** Minimum / maximum crop sheets a batch can hold. Relayout clamps to this
 *  range so a batch always has ≥1 sheet and never exceeds the engine budget. */
export const SHEET_MIN = 1;
export const SHEET_MAX = 10;

/** Resolves the spread (px) for the layout engine from a book dimension code.
 *  Falls back to the legacy 800×600 spread when the dimension is unset/unknown. */
function resolveSpread(dimension: number | null | undefined): {
  width: number;
  height: number;
} {
  if (dimension == null) return DEFAULT_CANVAS_SIZE;
  return DIMENSION_CANVAS_SIZE[dimension] ?? DEFAULT_CANVAS_SIZE;
}

/** Builds the title for sheet `index` — `"sheet <n+1>"` (1-based). */
function sheetTitle(index: number): string {
  return `sheet ${index + 1}`;
}

/**
 * Materializes engine output into `RemixCropSheet[]` (rev2 — batch model).
 *
 * Each placement's `geometry` (px, sheet-relative — engine output) overwrites
 * the placeholder geometry on the matching `CropEntry` metadata (which carries
 * `tags[]`). `image_url` is always '' (build API removed — client composes from
 * crops) and `swap_results` is always [] (geometry changed → any prior swap is
 * stale). No per-variant `variant_key` (dropped in rev2).
 */
export function buildSheetsFromLayout(
  layout: CropSheetLayoutResult,
  cropMetaById: Record<string, CropEntry>,
): RemixCropSheet[] {
  return layout.sheets.map((sheet) => ({
    title: sheetTitle(sheet.index),
    sheet_geometry: sheet.sheetGeometry,
    image_url: '',
    swap_results: [],
    crops: sheet.placements
      .map((p) => {
        const meta = cropMetaById[p.id];
        if (!meta) return null;
        return { ...meta, geometry: p.geometry };
      })
      .filter((c): c is CropEntry => c !== null),
  }));
}

/**
 * Computes crop sheets for the single batch of an insert payload and writes
 * them back IN PLACE — called inside `createRemix` BEFORE the Supabase INSERT
 * so `mixes[0].crop_sheets[]` is persisted in one round-trip.
 *
 * Reads the WHOLE payload (`groupCropsForBatch` needs `illustration` +
 * `characters`/`props` for the enabled set + order), packs at K=1 with
 * entity-affinity partition. Entity `crop_sheets` stay empty (rev2).
 */
export function computeCropSheets(
  payload: InsertableRemixRow,
  dimension: number | null | undefined,
): void {
  const spread = resolveSpread(dimension);
  log.info('computeCropSheets', 'start', {
    charCount: payload.characters.length,
    propCount: payload.props.length,
    batchCount: payload.mixes.length,
    spreadW: spread.width,
    spreadH: spread.height,
  });

  if (payload.mixes.length === 0) {
    log.warn('computeCropSheets', 'no batch skeleton — skip', {});
    return;
  }

  // groupCropsForBatch reads a Remix-like view (illustration + characters/props).
  const remixView = {
    illustration: payload.illustration,
    characters: payload.characters,
    props: payload.props,
  } as Remix;

  const { cropInputs, cropMetaById } = groupCropsForBatch(remixView);
  log.debug('computeCropSheets', 'grouped batch', {
    cropCount: cropInputs.length,
  });

  const layout = computeCropSheetLayout(cropInputs, { sheetCount: 1, spread });
  payload.mixes[0].crop_sheets = buildSheetsFromLayout(layout, cropMetaById);

  log.info('computeCropSheets', 'done', {
    batchSheetCount: payload.mixes[0].crop_sheets.length,
  });
}

// ── relayout (batch-scoped append / remove sheet) ────────────────────────────

/** Narrow store-accessor pair so this module stays decoupled from the full
 *  zustand store type (avoids a circular import with index.ts). */
export interface RelayoutDeps {
  set: (updater: (s: { remixes: Remix[] }) => { remixes: Remix[] }) => void;
  get: () => { remixes: Remix[] };
  /** Active book dimension code — resolves the layout spread size. */
  dimension: number | null | undefined;
  /** Cross-slice action — in-store-only update of a batch's `crop_sheets[]`
   *  (CRUD slice). Supabase persistence is handled HERE (engine). */
  patchRemixCropSheets: (remixId: string, updates: CropSheetUpdate[]) => void;
}

/**
 * Re-layouts ALL crop sheets of ONE batch at `currentSheetCount + delta`,
 * clamped to `[SHEET_MIN, SHEET_MAX]`. Re-groups every enabled-subject crop
 * from the frozen illustration (`groupCropsForBatch`) and re-packs.
 *
 * Returns `false` on any guard hit (missing remix/batch, no-op count change,
 * empty crop inputs, persist error rolled back); `true` after the relayout
 * persists.
 *
 * SWAP-RESULTS CONTRACT (callers MUST gate): a successful re-layout REBUILDS the
 * batch's sheets via `buildSheetsFromLayout`, which hardcodes `swap_results: []`
 * on every sheet — i.e. it DESTROYS swap_results of the batch. The store does
 * NOT warn. Any caller of `appendBatchSheet`/`removeBatchSheet` MUST gate on
 * existing `swap_results` before invoking (P08 confirm dialog).
 */
export async function relayoutBatchSheets(
  deps: RelayoutDeps,
  remixId: string,
  batchId: string,
  delta: number,
): Promise<boolean> {
  const { set, get, dimension, patchRemixCropSheets } = deps;
  log.info('relayoutBatchSheets', 'start', { remixId, batchId, delta });

  const prevRemix = get().remixes.find((r) => r.id === remixId);
  if (!prevRemix) {
    log.warn('relayoutBatchSheets', 'remix not found — abort', { remixId });
    return false;
  }

  const batch = prevRemix.mixes.find((m) => m.id === batchId);
  if (!batch) {
    log.warn('relayoutBatchSheets', 'batch not found — abort', {
      remixId,
      batchId,
    });
    return false;
  }

  const currentCount = batch.crop_sheets.length;
  const nextCount = Math.min(SHEET_MAX, Math.max(SHEET_MIN, currentCount + delta));
  if (nextCount === currentCount) {
    log.debug('relayoutBatchSheets', 'no count change — skip', {
      remixId,
      batchId,
      currentCount,
    });
    return false;
  }

  // Re-group from the frozen illustration — single source of truth for the
  // source (%) geometry the engine needs (post-create crop geometry is px).
  // ⚡rev6: scope per-batch — subset batches carry a strict subset of the
  // illustration's crops, so we filter the full grouping down to the batch's
  // (spread_id, id) lineup (`currentCropsOfBatch`). For a full-set batch (e.g.
  // seeded batch[0]) this collapses to the same result as groupCropsForBatch.
  const grouped = groupCropsForBatch(prevRemix);
  const batchCropKeys = new Set(
    currentCropsOfBatch(batch).map((c) => `${c.spread_id}/${c.id}`),
  );
  const cropInputs = grouped.cropInputs.filter((ci) => {
    const meta = grouped.cropMetaById[ci.id];
    if (!meta) return false;
    return batchCropKeys.has(`${meta.spread_id}/${meta.id}`);
  });
  const cropMetaById: Record<string, CropEntry> = {};
  for (const ci of cropInputs) {
    cropMetaById[ci.id] = grouped.cropMetaById[ci.id];
  }
  if (cropInputs.length === 0) {
    log.warn('relayoutBatchSheets', 'no crops to layout — abort', {
      remixId,
      batchId,
      batchSize: batchCropKeys.size,
    });
    return false;
  }

  const spread = resolveSpread(dimension);
  const layout = computeCropSheetLayout(cropInputs, {
    sheetCount: nextCount,
    spread,
  });
  const newSheets = buildSheetsFromLayout(layout, cropMetaById);

  log.debug('relayoutBatchSheets', 'optimistic replaceAll', {
    remixId,
    batchId,
    currentCount,
    nextCount,
    cropCount: cropInputs.length,
  });

  // Optimistic in-store update via CRUD slice's `patchRemixCropSheets`.
  patchRemixCropSheets(remixId, [
    {
      kind: 'replaceAll',
      entityType: 'mix',
      entityKey: batchId,
      sheets: newSheets,
    },
  ]);

  // Persist the `mixes` column with the freshest in-store value.
  const remixAfter = get().remixes.find((r) => r.id === remixId);
  if (!remixAfter) {
    log.warn('relayoutBatchSheets', 'remix gone before persist — skip', {
      remixId,
    });
    return false;
  }

  const { error } = await supabase
    .from('remixes')
    .update({ mixes: remixAfter.mixes })
    .eq('id', remixId);

  if (error) {
    log.error('relayoutBatchSheets', 'persist failed — rollback', {
      remixId,
      batchId,
      error: error.message,
    });
    // ROLLBACK LIMITATION (v1 single-writer assumption): restore the whole
    // remix snapshot pre-relayout. Concurrent realtime writes during the
    // persist window are clobbered — acceptable in v1 (modal is sole writer).
    set((s) => ({
      remixes: s.remixes.map((r) => (r.id === remixId ? prevRemix : r)),
    }));
    return false;
  }

  log.info('relayoutBatchSheets', 'done', { remixId, batchId, nextCount });
  return true;
}

// ── add / remove batch (whole-batch lifecycle) ───────────────────────────────

/** Persist the `mixes` column with the freshest in-store value, rolling back to
 *  `prevRemix` on error. Shared by add/remove batch. Returns `true` on success. */
async function persistMixes(
  deps: RelayoutDeps,
  remixId: string,
  prevRemix: Remix,
  action: string,
): Promise<boolean> {
  const { set, get } = deps;
  const remixAfter = get().remixes.find((r) => r.id === remixId);
  if (!remixAfter) {
    log.warn(action, 'remix gone before persist — skip', { remixId });
    return false;
  }
  const { error } = await supabase
    .from('remixes')
    .update({ mixes: remixAfter.mixes })
    .eq('id', remixId);
  if (error) {
    log.error(action, 'persist failed — rollback', { remixId, error: error.message });
    set((s) => ({
      remixes: s.remixes.map((r) => (r.id === remixId ? prevRemix : r)),
    }));
    return false;
  }
  return true;
}

/**
 * Appends a NEW batch to a remix as a SUBSET clone of the active batch
 * (rev6 — modal-driven "Add as Batch" with per-crop selection).
 *
 * `selectedCropKeys` is the set of `${spread_id}/${id}` keys the user picked
 * from the ACTIVE batch's pre-swap crops (`sheet.crops[]`, NOT
 * `swap_results[].crops[]`). The new batch is packed at K=1 from that
 * subset, then ordered as `max(order)+1`. Optimistic push + `mixes` persist
 * with full-remix rollback.
 *
 * Throws (caller catches + toasts) when:
 *   - `selectedCropKeys.size === 0` — empty selection is a UI bug.
 *   - The selection has zero matches against the active batch's lineup —
 *     stale keys (e.g. modal stayed open across a swap that rebuilt crops).
 *
 * Returns the new batch's id on persist success, `null` on guard miss / persist
 * error (callers can auto-select the new batch on success).
 */
export async function addBatch(
  deps: RelayoutDeps,
  remixId: string,
  activeBatchId: string,
  selectedCropKeys: ReadonlySet<string>,
): Promise<string | null> {
  const { set, get, dimension } = deps;
  log.info('addBatch', 'start', {
    remixId,
    activeBatchId,
    selectionSize: selectedCropKeys.size,
  });

  if (selectedCropKeys.size === 0) {
    log.warn('addBatch', 'empty selection — throw', { remixId, activeBatchId });
    throw new Error('addBatch requires a non-empty crop selection');
  }

  const prevRemix = get().remixes.find((r) => r.id === remixId);
  if (!prevRemix) {
    log.warn('addBatch', 'remix not found — abort', { remixId });
    return null;
  }

  const activeBatch =
    prevRemix.mixes.find((m) => m.id === activeBatchId) ?? prevRemix.mixes[0];
  if (!activeBatch) {
    log.warn('addBatch', 'no active batch — abort', { remixId, activeBatchId });
    return null;
  }

  // Pre-swap lineup of the active batch (sheet.crops[], NOT swap_results).
  const activeCrops = currentCropsOfBatch(activeBatch);
  const subsetKeys = new Set<string>();
  for (const crop of activeCrops) {
    const key = `${crop.spread_id}/${crop.id}`;
    if (selectedCropKeys.has(key)) subsetKeys.add(key);
  }

  if (subsetKeys.size === 0) {
    log.warn('addBatch', 'selection has zero matches in active batch — throw', {
      remixId,
      activeBatchId,
      selectionSize: selectedCropKeys.size,
      activeBatchSize: activeCrops.length,
    });
    throw new Error(
      'addBatch: selection does not match any crop of the active batch (stale)',
    );
  }

  // Re-derive engine inputs (source-% geometry) from the frozen illustration
  // and filter to the subset. CropEntry.geometry is px sheet-relative (engine
  // output) — we cannot feed it back into the engine, so we use the full
  // grouping as the canonical source-% lookup keyed by `(spread_id, id)`.
  const grouped = groupCropsForBatch(prevRemix);
  const cropInputs = grouped.cropInputs.filter((ci) => {
    const meta = grouped.cropMetaById[ci.id];
    if (!meta) return false;
    return subsetKeys.has(`${meta.spread_id}/${meta.id}`);
  });
  const cropMetaById: Record<string, CropEntry> = {};
  for (const ci of cropInputs) {
    cropMetaById[ci.id] = grouped.cropMetaById[ci.id];
  }

  if (cropInputs.length === 0) {
    log.warn('addBatch', 'subset resolved to no engine inputs — abort', {
      remixId,
      activeBatchId,
      subsetSize: subsetKeys.size,
    });
    return null;
  }

  const spread = resolveSpread(dimension);
  const layout = computeCropSheetLayout(cropInputs, { sheetCount: 1, spread });

  const order =
    prevRemix.mixes.reduce((max, m) => Math.max(max, m.order), -1) + 1;
  const newBatch: RemixMix = {
    ...makeBatchSkeleton(order, `Batch ${prevRemix.mixes.length + 1}`),
    crop_sheets: buildSheetsFromLayout(layout, cropMetaById),
  };

  set((s) => ({
    remixes: s.remixes.map((r) =>
      r.id === remixId ? { ...r, mixes: [...r.mixes, newBatch] } : r,
    ),
  }));

  log.debug('addBatch', 'optimistic push', {
    remixId,
    activeBatchId,
    batchId: newBatch.id,
    order,
    sheetCount: newBatch.crop_sheets.length,
    subsetSize: subsetKeys.size,
    cropCount: cropInputs.length,
  });

  const ok = await persistMixes(deps, remixId, prevRemix, 'addBatch');
  if (!ok) return null;
  log.info('addBatch', 'done', { remixId, batchId: newBatch.id });
  return newBatch.id;
}

/**
 * Removes a batch by id. Guarded so the last batch can never be removed
 * (`mixes.length > BATCH_MIN`). Optimistic filter + `mixes` persist with
 * full-remix rollback. Returns `true` on success.
 */
export async function removeBatch(
  deps: RelayoutDeps,
  remixId: string,
  batchId: string,
): Promise<boolean> {
  const { set, get } = deps;
  log.info('removeBatch', 'start', { remixId, batchId });

  const prevRemix = get().remixes.find((r) => r.id === remixId);
  if (!prevRemix) {
    log.warn('removeBatch', 'remix not found — abort', { remixId });
    return false;
  }
  if (!prevRemix.mixes.some((m) => m.id === batchId)) {
    log.warn('removeBatch', 'batch not found — abort', { remixId, batchId });
    return false;
  }
  if (prevRemix.mixes.length <= BATCH_MIN) {
    log.warn('removeBatch', 'cannot remove last batch — abort', {
      remixId,
      batchId,
      count: prevRemix.mixes.length,
    });
    return false;
  }

  set((s) => ({
    remixes: s.remixes.map((r) =>
      r.id === remixId
        ? { ...r, mixes: r.mixes.filter((m) => m.id !== batchId) }
        : r,
    ),
  }));

  log.debug('removeBatch', 'optimistic remove', { remixId, batchId });
  return persistMixes(deps, remixId, prevRemix, 'removeBatch');
}
