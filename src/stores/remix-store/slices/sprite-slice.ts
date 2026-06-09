// remix-store/slices/sprite-slice.ts — Sprite lifecycle (Variants tab —
// add/remove sprite + append/remove sprite sheet + lazy seed) + R5 take-back.
// Mirror of swap-slice.ts (the mix/batch plane) on the `sprites[]` plane. The
// sprite-swap ENQUEUE (`startSpriteSwap`) + finals auto-apply (`applySpriteFinals`)
// live in jobs-slice.ts.
//
// Cross-sprite `is_final` ownership: destructive mutations (remove sprite /
// relayout sheets) can orphan a winner cell — `reconcileSpriteFinalsAfterMutation`
// re-claims it (persists `sprites`) then re-applies finals to `characters`/`props`.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import { useBookStore } from '../../book-store';
import type { RelayoutDeps } from '../crop-sheet-layout';
import {
  addSprite as engineAddSprite,
  removeSprite as engineRemoveSprite,
  relayoutSpriteSheets,
  seedInitialSpriteIfMissing,
} from '../sprite-layout';
import {
  applySpriteTakeFinalBack,
  reconcileOrphanSpriteFinals,
} from '../sprite-ownership';
import type { RemixSpriteSlice, RemixSliceCreator } from '../types';

const log = createLogger('Store', 'RemixStore');

export const createSpriteSlice: RemixSliceCreator<RemixSpriteSlice> = (
  set,
  get,
) => {
  const buildDeps = (): RelayoutDeps => ({
    set: set as RelayoutDeps['set'],
    get: get as unknown as RelayoutDeps['get'],
    dimension: useBookStore.getState().currentBook?.dimension ?? null,
    patchRemixCropSheets: get().patchRemixCropSheets,
  });

  // R3 cross-sprite orphan reconcile — invoked AFTER a destructive sprite
  // mutation. Reads freshest sprites, runs the pure reconciler, and persists
  // `sprites` ONLY when a flag flips. Then re-applies finals to characters/props
  // (a removed/relaid winner may shift `visual_swap_url` to a new owner).
  const reconcileSpriteFinalsAfterMutation = async (
    remixId: string,
    callerLabel: string,
  ): Promise<void> => {
    const remix = get().remixes.find((r) => r.id === remixId);
    if (!remix) return;
    const pre = remix.sprites;
    const result = reconcileOrphanSpriteFinals(pre);
    if (result.changed) {
      log.info('reconcileSpriteFinalsAfterMutation', 'orphan reconcile applied', {
        remixId,
        caller: callerLabel,
        claimed: result.log.claimed,
        defensiveCleared: result.log.defensiveCleared,
        dropped: result.log.dropped,
      });
      set((s) => ({
        remixes: s.remixes.map((r) =>
          r.id === remixId ? { ...r, sprites: result.sprites } : r,
        ),
      }));
      const { error } = await supabase
        .from('remixes')
        .update({ sprites: result.sprites })
        .eq('id', remixId);
      if (error) {
        log.error('reconcileSpriteFinalsAfterMutation', 'persist failed — rollback', {
          remixId,
          caller: callerLabel,
          error: error.message,
        });
        set((s) => ({
          remixes: s.remixes.map((r) =>
            r.id === remixId ? { ...r, sprites: pre } : r,
          ),
        }));
        return;
      }
    }
    // Re-apply finals → characters/props (refetch is internal + idempotent).
    await get().applySpriteFinals(remixId);
  };

  return {
    addSprite: async (remixId, activeSpriteId, selectedCellKeys) => {
      log.info('addSprite', 'invoked', {
        remixId,
        activeSpriteId,
        selectionSize: selectedCellKeys.size,
      });
      return engineAddSprite(buildDeps(), remixId, activeSpriteId, selectedCellKeys);
    },

    removeSprite: async (remixId, spriteId) => {
      log.info('removeSprite', 'invoked', { remixId, spriteId });
      const ok = await engineRemoveSprite(buildDeps(), remixId, spriteId);
      if (ok) await reconcileSpriteFinalsAfterMutation(remixId, 'removeSprite');
      return ok;
    },

    appendSpriteSheet: async (remixId, spriteId) => {
      log.info('appendSpriteSheet', 'invoked', { remixId, spriteId });
      const ok = await relayoutSpriteSheets(buildDeps(), remixId, spriteId, 1);
      if (ok) await reconcileSpriteFinalsAfterMutation(remixId, 'appendSpriteSheet');
      return ok;
    },

    removeSpriteSheet: async (remixId, spriteId, sheetIndex) => {
      // `sheetIndex` accepted for caller-API parity but unused — the engine
      // re-packs from scratch (delta -1 + SHEET_MIN clamp is the guard).
      log.info('removeSpriteSheet', 'invoked', { remixId, spriteId, sheetIndex });
      const ok = await relayoutSpriteSheets(buildDeps(), remixId, spriteId, -1);
      if (ok) await reconcileSpriteFinalsAfterMutation(remixId, 'removeSpriteSheet');
      return ok;
    },

    ensureRemixSpriteSeed: async (remixId) => {
      log.info('ensureRemixSpriteSeed', 'invoked', { remixId });
      return seedInitialSpriteIfMissing(buildDeps(), remixId);
    },

    // ── R5 user Take-Back (cross-sprite is_final mutex override) ──────
    takeSpriteFinalBack: async (remixId, type, objectKey, variantKey, fromSpriteId) => {
      log.info('takeSpriteFinalBack', 'invoked', {
        remixId,
        type,
        objectKey,
        variantKey,
        fromSpriteId,
      });

      // Defense-in-depth: UI already disables when a sprite swap runs.
      const state = get();
      const swapRunning = state.jobs.some(
        (j) =>
          j.phase === 'remix_sprite_swap' &&
          j.remixId === remixId &&
          (j.status === 'queued' || j.status === 'running'),
      );
      if (swapRunning) {
        log.warn('takeSpriteFinalBack', 'gated by anySpriteSwapRunning', { remixId });
        throw new Error(
          'Cannot take a final back while a sprite swap is running for this remix',
        );
      }

      const prevRemix = state.remixes.find((r) => r.id === remixId);
      if (!prevRemix) {
        log.warn('takeSpriteFinalBack', 'remix not found — skip', { remixId });
        return false;
      }

      const nextSprites = applySpriteTakeFinalBack(
        prevRemix.sprites,
        type,
        objectKey,
        variantKey,
        fromSpriteId,
      );
      if (nextSprites === null) {
        log.warn('takeSpriteFinalBack', 'target cell or fromSpriteId missing — skip', {
          remixId,
          fromSpriteId,
        });
        return false;
      }

      set((s) => ({
        remixes: s.remixes.map((r) =>
          r.id === remixId ? { ...r, sprites: nextSprites } : r,
        ),
      }));

      const { error } = await supabase
        .from('remixes')
        .update({ sprites: nextSprites })
        .eq('id', remixId);

      if (error) {
        log.error('takeSpriteFinalBack', 'persist failed — rollback', {
          remixId,
          error: error.message,
        });
        set((s) => ({
          remixes: s.remixes.map((r) => (r.id === remixId ? prevRemix : r)),
        }));
        return false;
      }

      // New owner → reflect visual_swap_url on characters/props.
      await get().applySpriteFinals(remixId);
      log.info('takeSpriteFinalBack', 'done', { remixId, fromSpriteId });
      return true;
    },
  };
};
