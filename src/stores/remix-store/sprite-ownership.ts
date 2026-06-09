// sprite-ownership.ts — Cross-sprite `is_final` mutex helpers (pure). Mirror of
// `selectors/select-final-crops.ts` (mix plane) on the sprite plane, keyed by
// the sprite cellKey `(type, object_key, variant_key)` and tie-broken by highest
// `sprite.order`.
//
//   - `resolveSpriteOwners(sprites)` — cellKey → winner sprite info. Drives the
//     Stage AFTER-pane ownership badge (★ owner / dim+take-back non-owner).
//   - `applySpriteTakeFinalBack(...)` — R5 user take-back: set is_final on one
//     sprite's cell, clear it on every other sprite (mutex).
//   - `reconcileOrphanSpriteFinals(sprites)` — R3: re-claim orphan cells +
//     collapse duplicate finals after a destructive sprite mutation. Idempotent
//     (`changed=false` short-circuits before clone).
//
// Reader contract: `is_final` is ONLY meaningful on crops whose container
// `swap_results.is_selected=true`.

import type { RemixSpriteEntry } from '@/types/remix';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SpriteOwnership');

export const spriteOwnerKey = (
  type: string,
  objectKey: string,
  variantKey: string,
) => `${type}/${objectKey}/${variantKey}`;

export interface SpriteOwner {
  spriteId: string;
  order: number;
  media_url: string;
}

/** Map cellKey → owning sprite (the is_final winner). Highest `sprite.order`
 *  wins on a (defensive) multi-winner; lex tie-break on sprite.id. */
export function resolveSpriteOwners(
  sprites: RemixSpriteEntry[] | null | undefined,
): Map<string, SpriteOwner> {
  const owners = new Map<string, SpriteOwner>();
  if (!sprites) return owners;
  for (const sprite of sprites) {
    if (!sprite?.crop_sheets) continue;
    for (const sheet of sprite.crop_sheets) {
      const selected = sheet?.swap_results?.find((r) => r?.is_selected);
      if (!selected?.crops) continue;
      for (const crop of selected.crops) {
        if (crop?.is_final !== true) continue;
        const key = spriteOwnerKey(crop.type, crop.object_key, crop.variant_key);
        const existing = owners.get(key);
        if (
          !existing ||
          sprite.order > existing.order ||
          (sprite.order === existing.order && sprite.id < existing.spriteId)
        ) {
          owners.set(key, {
            spriteId: sprite.id,
            order: sprite.order,
            media_url: crop.media_url,
          });
        }
      }
    }
  }
  return owners;
}

interface CropRef {
  spriteIdx: number;
  sheetIdx: number;
  swapResultIdx: number;
  cropIdx: number;
  order: number;
  spriteId: string;
}

function pickWinner(refs: CropRef[]): CropRef {
  return refs.reduce((best, cur) => {
    if (cur.order > best.order) return cur;
    if (cur.order === best.order && cur.spriteId < best.spriteId) return cur;
    return best;
  });
}

/**
 * R5 take-back — set `is_final=true` on the cell `(type, objectKey, variantKey)`
 * inside `fromSpriteId` AND clear is_final on every other sprite's matching cell
 * (mutex). Returns a fresh `sprites` blob, or null when the sprite/cell is
 * missing. Mirror of `applyTakeFinalBack` (mix).
 */
export function applySpriteTakeFinalBack(
  sprites: RemixSpriteEntry[],
  type: string,
  objectKey: string,
  variantKey: string,
  fromSpriteId: string,
): RemixSpriteEntry[] | null {
  const fromIdx = sprites.findIndex((s) => s.id === fromSpriteId);
  if (fromIdx < 0) return null;

  let foundSheet = -1;
  let foundSwap = -1;
  let foundCrop = -1;
  const from = sprites[fromIdx];
  outer: for (let si = 0; si < from.crop_sheets.length; si += 1) {
    const sheet = from.crop_sheets[si];
    const swapIdx = sheet.swap_results.findIndex((r) => r?.is_selected);
    if (swapIdx < 0) continue;
    const crops = sheet.swap_results[swapIdx]?.crops ?? [];
    for (let ci = 0; ci < crops.length; ci += 1) {
      const crop = crops[ci];
      if (
        crop.type === type &&
        crop.object_key === objectKey &&
        crop.variant_key === variantKey
      ) {
        foundSheet = si;
        foundSwap = swapIdx;
        foundCrop = ci;
        break outer;
      }
    }
  }
  if (foundCrop < 0) return null;

  const cloned = structuredClone(sprites);
  cloned[fromIdx].crop_sheets[foundSheet].swap_results[foundSwap].crops[
    foundCrop
  ].is_final = true;
  for (let si = 0; si < cloned.length; si += 1) {
    if (si === fromIdx) continue;
    for (const sheet of cloned[si].crop_sheets) {
      for (const result of sheet.swap_results) {
        for (const crop of result.crops) {
          if (
            crop.type === type &&
            crop.object_key === objectKey &&
            crop.variant_key === variantKey &&
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

export interface SpriteReconcileResult {
  sprites: RemixSpriteEntry[];
  changed: boolean;
  log: { claimed: number; defensiveCleared: number; dropped: number };
}

/**
 * R3 orphan reconcile — re-claim cells whose winner was removed (fallback
 * highest `sprite.order`) + collapse duplicate finals. Idempotent: returns the
 * input ref + `changed=false` when nothing flips. Mirror of
 * `reconcileOrphanFinals` (mix).
 */
export function reconcileOrphanSpriteFinals(
  sprites: RemixSpriteEntry[] | null | undefined,
): SpriteReconcileResult {
  const safe = sprites ?? [];
  const key2finals = new Map<string, CropRef[]>();
  const key2candidates = new Map<string, CropRef[]>();

  for (let si = 0; si < safe.length; si += 1) {
    const sprite = safe[si];
    if (!sprite?.crop_sheets) continue;
    for (let sh = 0; sh < sprite.crop_sheets.length; sh += 1) {
      const sheet = sprite.crop_sheets[sh];
      const selIdx = sheet?.swap_results?.findIndex((r) => r?.is_selected) ?? -1;
      if (selIdx < 0) continue;
      const crops = sheet.swap_results[selIdx]?.crops ?? [];
      for (let ci = 0; ci < crops.length; ci += 1) {
        const crop = crops[ci];
        if (!crop) continue;
        const key = spriteOwnerKey(crop.type, crop.object_key, crop.variant_key);
        const ref: CropRef = {
          spriteIdx: si,
          sheetIdx: sh,
          swapResultIdx: selIdx,
          cropIdx: ci,
          order: sprite.order,
          spriteId: sprite.id,
        };
        const cand = key2candidates.get(key);
        if (cand) cand.push(ref);
        else key2candidates.set(key, [ref]);
        if (crop.is_final === true) {
          const fin = key2finals.get(key);
          if (fin) fin.push(ref);
          else key2finals.set(key, [ref]);
        }
      }
    }
  }

  interface Decision {
    winnerRef: CropRef;
  }
  const decisions = new Map<string, Decision>();
  let defensiveCleared = 0;
  for (const [key, finals] of key2finals.entries()) {
    if (finals.length === 1) {
      decisions.set(key, { winnerRef: finals[0] });
    } else {
      const winner = pickWinner(finals);
      decisions.set(key, { winnerRef: winner });
      defensiveCleared += finals.length - 1;
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
    decisions.set(key, { winnerRef: pickWinner(candidates) });
    claimed += 1;
  }

  // Change detection.
  let changed = false;
  for (const [key, candidates] of key2candidates.entries()) {
    const decision = decisions.get(key);
    if (!decision) continue;
    for (const cand of candidates) {
      const crop =
        safe[cand.spriteIdx].crop_sheets[cand.sheetIdx].swap_results[
          cand.swapResultIdx
        ].crops[cand.cropIdx];
      const isWinner =
        cand.spriteIdx === decision.winnerRef.spriteIdx &&
        cand.sheetIdx === decision.winnerRef.sheetIdx &&
        cand.swapResultIdx === decision.winnerRef.swapResultIdx &&
        cand.cropIdx === decision.winnerRef.cropIdx;
      if ((crop.is_final === true) !== isWinner) {
        changed = true;
        break;
      }
    }
    if (changed) break;
  }

  if (!changed) {
    return {
      sprites: safe,
      changed: false,
      log: { claimed: 0, defensiveCleared: 0, dropped },
    };
  }

  const cloned = structuredClone(safe);
  for (const [key, candidates] of key2candidates.entries()) {
    const decision = decisions.get(key);
    if (!decision) continue;
    for (const cand of candidates) {
      const crop =
        cloned[cand.spriteIdx].crop_sheets[cand.sheetIdx].swap_results[
          cand.swapResultIdx
        ].crops[cand.cropIdx];
      crop.is_final =
        cand.spriteIdx === decision.winnerRef.spriteIdx &&
        cand.sheetIdx === decision.winnerRef.sheetIdx &&
        cand.swapResultIdx === decision.winnerRef.swapResultIdx &&
        cand.cropIdx === decision.winnerRef.cropIdx;
    }
  }

  log.info('reconcileOrphanSpriteFinals', 'done', { claimed, defensiveCleared, dropped });
  return { sprites: cloned, changed: true, log: { claimed, defensiveCleared, dropped } };
}
