// remix-store/slices/swap-slice.ts — Entity swap slice. Ephemeral per-KEY swap
// tasks (memory-only, no background_jobs row) + variant-scoped crop-sheet
// count append/remove.
//
// `startEntitySwap` is a NO-OP STUB (Validation S1) — the swap endpoint is not
// implemented yet, and the UI hard-disables the `[⇄]` button (Phase 04 spec).
// Action signature is preserved for parity with the store §4.4 spec so Phase
// 06 modal integration doesn't need to change when the endpoint ships.

import { createLogger } from '@/utils/logger';
import { useBookStore } from '../../book-store';
import { relayoutVariantCropSheets } from '../crop-sheet-layout';
import { buildEntityTaskKey } from '../slice-helpers';
import type { RemixSwapSlice, RemixSliceCreator } from '../types';

const log = createLogger('Store', 'RemixStore');

export const createSwapSlice: RemixSliceCreator<RemixSwapSlice> = (
  set,
  get,
) => ({
  entitySwapTasks: {},

  // ── Entity swap (modal-driven, per-key) ────────────────────────────
  // NO-OP STUB (Validation S1) — swap endpoint not implemented yet. Phase 04
  // hard-disables `[⇄]` button so no UI code path triggers this; keeping the
  // action makes Phase 06 wiring trivial when the endpoint ships.
  startEntitySwap: async (params) => {
    const taskKey = buildEntityTaskKey(
      params.remixId,
      params.type,
      params.key,
    );
    log.debug(
      'startEntitySwap',
      'endpoint not implemented yet — no-op',
      { taskKey, type: params.type, key: params.key },
    );
    return;
  },

  // ── Crop sheet count (modal-driven append / remove) ────────────────
  // Both delegate to the variant-scoped re-layout helper. The engine re-groups
  // crops from the (frozen) illustration, FILTERS by `variantKey` (mix: no
  // filter), then re-packs the target variant group. Sibling variants
  // pass-through unchanged.
  //
  // CONTRACT — DESTRUCTIVE (TARGET VARIANT ONLY): `appendCropSheet` and
  // `removeCropSheet` both run `relayoutVariantCropSheets`, which REBUILDS the
  // target variant's sheets via `buildSheetsFromLayout` (which hardcodes
  // `swap_results: []`) — i.e. it DESTROYS swap_results in the target variant.
  // Sibling-variant sheets are preserved verbatim. The store does NOT warn.
  // Callers MUST gate on existing swap_results themselves (currently only the
  // P6 swap modal's confirm dialog does). Any future caller bypassing that
  // warning silently discards the user's swaps in the target variant.
  appendCropSheet: async (remixId, type, key, variantKey) => {
    log.info('appendCropSheet', 'invoked', {
      remixId,
      type,
      key,
      variantKey,
    });
    const dimension =
      useBookStore.getState().currentBook?.dimension ?? null;
    return relayoutVariantCropSheets(
      {
        set,
        get,
        dimension,
        patchRemixCropSheets: get().patchRemixCropSheets,
      },
      remixId,
      type,
      key,
      variantKey,
      1,
    );
  },

  removeCropSheet: async (remixId, type, key, variantKey, sheetIndex) => {
    // DESTRUCTIVE (target variant) — see the `appendCropSheet` contract above.
    // `sheetIndex` is accepted for caller-API parity but unused: the engine
    // re-packs from scratch, so "which" sheet inside the variant scope is
    // moot. Delta -1 + SHEET_MIN clamp inside `relayoutVariantCropSheets` is
    // the guard.
    log.info('removeCropSheet', 'invoked', {
      remixId,
      type,
      key,
      variantKey,
      sheetIndex,
    });
    const dimension =
      useBookStore.getState().currentBook?.dimension ?? null;
    return relayoutVariantCropSheets(
      {
        set,
        get,
        dimension,
        patchRemixCropSheets: get().patchRemixCropSheets,
      },
      remixId,
      type,
      key,
      variantKey,
      -1,
    );
  },
});
