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
  addBatch: async (remixId) => {
    log.info('addBatch', 'invoked', { remixId });
    return engineAddBatch(buildDeps(), remixId);
  },

  removeBatch: async (remixId, batchId) => {
    log.info('removeBatch', 'invoked', { remixId, batchId });
    return engineRemoveBatch(buildDeps(), remixId, batchId);
  },

  appendBatchSheet: async (remixId, batchId) => {
    log.info('appendBatchSheet', 'invoked', { remixId, batchId });
    return relayoutBatchSheets(buildDeps(), remixId, batchId, 1);
  },

  removeBatchSheet: async (remixId, batchId, sheetIndex) => {
    // `sheetIndex` is accepted for caller-API parity but unused: the engine
    // re-packs from scratch, so "which" sheet is moot. Delta -1 + SHEET_MIN
    // clamp inside `relayoutBatchSheets` is the guard.
    log.info('removeBatchSheet', 'invoked', { remixId, batchId, sheetIndex });
    return relayoutBatchSheets(buildDeps(), remixId, batchId, -1);
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
