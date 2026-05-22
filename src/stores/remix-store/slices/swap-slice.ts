// remix-store/slices/swap-slice.ts — Entity swap slice. Ephemeral per-KEY swap
// tasks (memory-only, no background_jobs row) + variant-scoped crop-sheet
// count append/remove.
//
// `startEntitySwap` is a NO-OP STUB (Validation S1) — the swap endpoint is not
// implemented yet, and the UI hard-disables the `[⇄]` button (Phase 04 spec).
// Action signature is preserved for parity with the store §4.4 spec so Phase
// 06 modal integration doesn't need to change when the endpoint ships.

import { supabase } from '@/apis/supabase';
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
});
