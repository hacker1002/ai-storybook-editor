// remix-store/slices/swap-slice.ts — Batch lifecycle (add/remove batch +
// append/remove batch sheet) + per-variant visual-swap persist (rev2). The
// character-swap / mix-swap ENQUEUE actions live in jobs-slice.ts (co-located
// with the other background-job enqueue actions per Validation S1) — NOT here.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import { useBookStore } from '../../book-store';
import {
  addBatch as engineAddBatch,
  removeBatch as engineRemoveBatch,
  relayoutBatchSheets,
  type RelayoutDeps,
} from '../crop-sheet-layout';
import {
  applyTakeFinalBack,
  reconcileOrphanFinals,
} from '../selectors/select-final-crops';
import type { RemixSwapSlice, RemixSliceCreator } from '../types';

const log = createLogger('Store', 'RemixStore');

export const createSwapSlice: RemixSliceCreator<RemixSwapSlice> = (
  set,
  get,
) => {
  // Build the engine `RelayoutDeps` (set/get + active book dimension) — shared
  // by every batch-lifecycle action. `set`/`get` are the full-store creator
  // args; the engine narrows to `{ remixes }`, structurally compatible.
  const buildDeps = (): RelayoutDeps => ({
    set: set as RelayoutDeps['set'],
    get: get as unknown as RelayoutDeps['get'],
    dimension: useBookStore.getState().currentBook?.dimension ?? null,
    patchRemixCropSheets: get().patchRemixCropSheets,
  });

  // R3 cross-batch `is_final` orphan reconcile — invoked AFTER a destructive
  // batch mutation (engine already persisted entity sheets/crops). Reads
  // freshest mixes, runs the pure reconciler, and persists ONLY when the
  // result actually flips at least one flag (`changed=true`). On persist fail
  // we roll back to the pre-reconcile in-store snapshot (engine output, which
  // IS the committed DB state).
  const reconcileFinalsAfterMutation = async (
    remixId: string,
    callerLabel: string,
  ): Promise<void> => {
    const remix = get().remixes.find((r) => r.id === remixId);
    if (!remix) return;
    const pre = remix.mixes;
    const result = reconcileOrphanFinals(pre);
    if (!result.changed) return;

    log.info('reconcileFinalsAfterMutation', `orphan reconcile applied`, {
      remixId,
      caller: callerLabel,
      claimed: result.log.claimed,
      defensiveCleared: result.log.defensiveCleared,
      dropped: result.log.dropped,
    });

    set((s) => ({
      remixes: s.remixes.map((r) =>
        r.id === remixId ? { ...r, mixes: result.mixes } : r,
      ),
    }));

    const { error } = await supabase
      .from('remixes')
      .update({ mixes: result.mixes })
      .eq('id', remixId);
    if (error) {
      log.error(
        'reconcileFinalsAfterMutation',
        'persist failed — rollback to engine-committed mixes',
        { remixId, caller: callerLabel, error: error.message },
      );
      set((s) => ({
        remixes: s.remixes.map((r) =>
          r.id === remixId ? { ...r, mixes: pre } : r,
        ),
      }));
    }
  };

  return {
  // ── Batch lifecycle (modal-driven) ─────────────────────────────────
  // add/remove a whole batch; append/remove one sheet within a batch. The
  // engine re-groups ALL enabled-subject crops from the frozen illustration
  // and re-packs at the new sheet count.
  //
  // CONTRACT — DESTRUCTIVE (whole batch): `appendBatchSheet`/`removeBatchSheet`
  // rebuild the batch's sheets via `buildSheetsFromLayout` (hardcodes
  // `swap_results: []`) — i.e. they DESTROY swap_results of the batch. The store
  // does NOT warn. Callers MUST gate on existing swap_results (P08 confirm
  // dialog).
  addBatch: async (remixId, activeBatchId, selectedCropKeys) => {
    log.info('addBatch', 'invoked', {
      remixId,
      activeBatchId,
      selectionSize: selectedCropKeys.size,
    });
    return engineAddBatch(buildDeps(), remixId, activeBatchId, selectedCropKeys);
  },

  // ── Lazy seed of an initial batch (rev6 — modal mount) ─────────────────
  // Thin alias to `migrateLegacyRemixToBatch` with a fast-path guard
  // `mixes.length >= 1`. Both are idempotent — the alias only saves modal
  // callers a cross-slice reach.
  seedInitialBatchIfMissing: async (remixId) => {
    const remix = get().remixes.find((r) => r.id === remixId);
    if (!remix) {
      log.warn('seedInitialBatchIfMissing', 'remix not found — skip', {
        remixId,
      });
      return false;
    }
    if (remix.mixes.length >= 1) {
      log.debug('seedInitialBatchIfMissing', 'batch already present — skip', {
        remixId,
        mixCount: remix.mixes.length,
      });
      return false;
    }
    log.info('seedInitialBatchIfMissing', 'delegate to migration', { remixId });
    return get().migrateLegacyRemixToBatch(remixId);
  },

  removeBatch: async (remixId, batchId) => {
    log.info('removeBatch', 'invoked', { remixId, batchId });
    const ok = await engineRemoveBatch(buildDeps(), remixId, batchId);
    if (ok) await reconcileFinalsAfterMutation(remixId, 'removeBatch');
    return ok;
  },

  appendBatchSheet: async (remixId, batchId) => {
    log.info('appendBatchSheet', 'invoked', { remixId, batchId });
    const ok = await relayoutBatchSheets(buildDeps(), remixId, batchId, 1);
    if (ok) await reconcileFinalsAfterMutation(remixId, 'appendBatchSheet');
    return ok;
  },

  removeBatchSheet: async (remixId, batchId, sheetIndex) => {
    // `sheetIndex` is accepted for caller-API parity but unused: the engine
    // re-packs from scratch, so "which" sheet is moot. Delta -1 + SHEET_MIN
    // clamp inside `relayoutBatchSheets` is the guard.
    log.info('removeBatchSheet', 'invoked', { remixId, batchId, sheetIndex });
    const ok = await relayoutBatchSheets(buildDeps(), remixId, batchId, -1);
    if (ok) await reconcileFinalsAfterMutation(remixId, 'removeBatchSheet');
    return ok;
  },

  // ── R5 user Take-Back (cross-batch `is_final` mutex override) ──────
  takeFinalBack: async (remixId, spreadId, layerId, fromBatchId) => {
    log.info('takeFinalBack', 'invoked', {
      remixId,
      spreadId,
      layerId,
      fromBatchId,
    });

    // Defense-in-depth: UI already disables the button when a swap is
    // running. Cross-check via jobs[] (mirror selector logic without
    // pulling React hooks into store code).
    const state = get();
    const swapRunning = state.jobs.some(
      (j) =>
        j.phase === 'remix_mix_swap' &&
        j.remixId === remixId &&
        (j.status === 'queued' || j.status === 'running'),
    );
    if (swapRunning) {
      log.warn('takeFinalBack', 'gated by anyMixSwapRunning', { remixId });
      throw new Error(
        'Cannot take a final crop back while a swap is running for this remix',
      );
    }

    const prevRemix = state.remixes.find((r) => r.id === remixId);
    if (!prevRemix) {
      log.warn('takeFinalBack', 'remix not found — skip', { remixId });
      return false;
    }

    const nextMixes = applyTakeFinalBack(
      prevRemix.mixes,
      spreadId,
      layerId,
      fromBatchId,
    );
    if (nextMixes === null) {
      log.warn('takeFinalBack', 'target crop or fromBatchId missing — skip', {
        remixId,
        fromBatchId,
        spreadId,
        layerId,
      });
      return false;
    }

    // Optimistic in-store update.
    set((s) => ({
      remixes: s.remixes.map((r) =>
        r.id === remixId ? { ...r, mixes: nextMixes } : r,
      ),
    }));
    log.debug('takeFinalBack', 'optimistic set applied', { remixId });

    const { error } = await supabase
      .from('remixes')
      .update({ mixes: nextMixes })
      .eq('id', remixId);

    if (error) {
      log.error('takeFinalBack', 'persist failed — rollback', {
        remixId,
        error: error.message,
      });
      set((s) => ({
        remixes: s.remixes.map((r) => (r.id === remixId ? prevRemix : r)),
      }));
      return false;
    }

    log.info('takeFinalBack', 'done', { remixId, fromBatchId });
    return true;
  },

  // ── Per-variant visual swap result (persist-writer) ────────────────
  // Writes `characters[charKey].variants[variantKey].visual_swap_url` and
  // persists the whole `characters` JSONB column. Optimistic set + full-remix
  // snapshot rollback on error (single-writer assumption — mirrors
  // `relayoutVariantCropSheets`). `imageUrl=null` clears/reverts the field.
  // Does NOT touch `remix_config` or `background_jobs` (char-only feature;
  // props never call this).
  //
  // RETURNS `true` once the Supabase write succeeds; `false` on any guard miss
  // (remix/char/variant not found) OR after a persist error has been rolled
  // back. Callers (e.g. `runVariantSwap`) MUST surface `false` as an error so
  // the optimistic AFTER image is not shown as "done" while the DB lost it.
  setVariantVisualSwapUrl: async (remixId, charKey, variantKey, imageUrl) => {
    log.info('setVariantVisualSwapUrl', 'invoked', {
      remixId,
      charKey,
      variantKey,
      hasImage: imageUrl !== null,
    });

    const prevRemix = get().remixes.find((r) => r.id === remixId);
    if (!prevRemix) {
      log.warn('setVariantVisualSwapUrl', 'remix not found — skip', {
        remixId,
      });
      return false;
    }

    const char = prevRemix.characters.find((c) => c.key === charKey);
    if (!char) {
      log.warn('setVariantVisualSwapUrl', 'character not found — skip', {
        remixId,
        charKey,
      });
      return false;
    }
    if (!char.variants.some((v) => v.key === variantKey)) {
      log.warn('setVariantVisualSwapUrl', 'variant not found — skip', {
        remixId,
        charKey,
        variantKey,
      });
      return false;
    }

    // Optimistic in-store update — clone characters[] down to the target
    // variant so we never mutate the previous snapshot (kept for rollback).
    set((s) => ({
      remixes: s.remixes.map((r) => {
        if (r.id !== remixId) return r;
        return {
          ...r,
          characters: r.characters.map((c) => {
            if (c.key !== charKey) return c;
            return {
              ...c,
              variants: c.variants.map((v) =>
                v.key === variantKey
                  ? { ...v, visual_swap_url: imageUrl }
                  : v,
              ),
            };
          }),
        };
      }),
    }));

    log.debug('setVariantVisualSwapUrl', 'optimistic set applied', {
      remixId,
      charKey,
      variantKey,
    });

    // Persist the `characters` column with the freshest in-store value.
    const remixAfter = get().remixes.find((r) => r.id === remixId);
    if (!remixAfter) {
      log.warn('setVariantVisualSwapUrl', 'remix gone before persist — skip', {
        remixId,
      });
      return false;
    }

    const { error } = await supabase
      .from('remixes')
      .update({ characters: remixAfter.characters })
      .eq('id', remixId);

    if (error) {
      log.error('setVariantVisualSwapUrl', 'persist failed — rollback', {
        remixId,
        charKey,
        variantKey,
        error: error.message,
      });
      // ROLLBACK LIMITATION (v1 single-writer assumption): restore the whole
      // remix snapshot. A concurrent writer mutation during the persist window
      // would be clobbered — safe in v1 (modal is the only writer at a time).
      set((s) => ({
        remixes: s.remixes.map((r) => (r.id === remixId ? prevRemix : r)),
      }));
      return false;
    }

    log.info('setVariantVisualSwapUrl', 'done', {
      remixId,
      charKey,
      variantKey,
    });
    return true;
  },
  };
};
