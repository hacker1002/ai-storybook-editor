// remix-store/slices/swap-slice.ts — Entity swap slice. Ephemeral per-KEY swap
// tasks (memory-only, no background_jobs row) + crop-sheet count append/remove.
// `startEntitySwap` is a DEFERRED no-op stub (Validation S1) — the guard +
// remix/entity resolution + log are real; the swap loop lands with the API.

import { createLogger } from '@/utils/logger';
import { useBookStore } from '../../book-store';
import { relayoutCropSheets } from '../crop-sheet-layout';
import { buildEntityTaskKey, resolveEntity } from '../slice-helpers';
import type { RemixSwapSlice, RemixSliceCreator } from '../types';

const log = createLogger('Store', 'RemixStore');

export const createSwapSlice: RemixSliceCreator<RemixSwapSlice> = (
  set,
  get,
) => ({
  entitySwapTasks: {},

  // ── Entity swap (modal-driven, per-key) ────────────────────────────
  // DEFERRED stub (Validation S1) — swap API not ready in v1. Guard +
  // remix/entity resolution + log are real; the swap loop + POST + persist
  // land when the swap API ships. Never sets `running`/`error` so the
  // entitySwapTasks map stays empty and the UI never spins.
  startEntitySwap: async (params) => {
    const taskKey = buildEntityTaskKey(
      params.remixId,
      params.type,
      params.key,
    );
    log.info('startEntitySwap', 'invoked', {
      taskKey,
      type: params.type,
      key: params.key,
    });

    // Guard — only one swap may run per remix at a time. (Always passes in
    // v1 since the stub never sets a `running` task, but kept real so the
    // contract holds when the swap loop lands.)
    const prefix = `${params.remixId}:`;
    const anyRunning = Object.entries(get().entitySwapTasks).some(
      ([k, v]) => k.startsWith(prefix) && v.state === 'running',
    );
    if (anyRunning) {
      log.debug('startEntitySwap', 'blocked — a swap is already running', {
        remixId: params.remixId,
      });
      return;
    }

    // Resolve remix + entity so the contract (and logs) match the real
    // implementation; bail with a warn when either is missing.
    const remix = get().remixes.find((r) => r.id === params.remixId);
    if (!remix) {
      log.warn('startEntitySwap', 'remix not found — abort', {
        remixId: params.remixId,
      });
      return;
    }
    const entity = resolveEntity(remix, params.type, params.key);
    if (!entity) {
      log.warn('startEntitySwap', 'entity not found — abort', {
        remixId: params.remixId,
        type: params.type,
        key: params.key,
      });
      return;
    }

    // ── DEFERRED: swap API endpoint not yet implemented (plan §unresolved
    //    #1). When ready, replace this block with:
    //      set entitySwapTasks[taskKey] → { state:'running', current:0, total }
    //      FOR each crop sheet → POST /api/remix/swap-character-crop-sheet
    //      gather CropSheetPatch[] → patchRemixCropSheets + persist Supabase
    //      all OK → clear task; ≥1 fail → { state:'error', message, failedSheets }
    log.warn(
      'startEntitySwap',
      'NO-OP — swap API endpoint not implemented (deferred)',
      { taskKey, type: params.type, sheetCount: entity.crop_sheets.length },
    );
    // Task stays idle (never set running/error) → UI never stuck spinning.
    return;
  },

  // ── Crop sheet count (modal-driven append / remove) ────────────────
  // Both delegate to the shared client-side re-layout helper. The engine
  // re-groups every crop from the (frozen) illustration and re-packs it
  // across the new sheet count — there is no per-sheet blank insert/filter.
  //
  // CONTRACT — DESTRUCTIVE: `appendCropSheet` and `removeCropSheet` both run
  // `relayoutCropSheets`, which REBUILDS `crop_sheets[]` and WIPES ALL
  // `swap_results` for the entity (geometry changes → prior swaps are stale).
  // The store does NOT warn. Callers MUST gate on existing swap_results
  // themselves (currently only the P6 swap modal's confirm dialog does). Any
  // future caller bypassing that warning silently discards the user's swaps.
  appendCropSheet: async (remixId, type, key) => {
    log.info('appendCropSheet', 'invoked', { remixId, type, key });
    const dimension =
      useBookStore.getState().currentBook?.dimension ?? null;
    return relayoutCropSheets({ set, get, dimension }, remixId, type, key, 1);
  },

  removeCropSheet: async (remixId, type, key, sheetIndex) => {
    // DESTRUCTIVE — see the `appendCropSheet` contract above: this wipes ALL
    // swap_results for the entity. Callers MUST gate on existing swap_results.
    // `sheetIndex` is accepted for caller-API parity but unused — the
    // engine re-packs from scratch, so dropping "which" sheet is moot;
    // delta -1 + SHEET_MIN clamp inside `relayoutCropSheets` is the guard.
    log.info('removeCropSheet', 'invoked', {
      remixId,
      type,
      key,
      sheetIndex,
    });
    const dimension =
      useBookStore.getState().currentBook?.dimension ?? null;
    return relayoutCropSheets(
      { set, get, dimension },
      remixId,
      type,
      key,
      -1,
    );
  },
});
