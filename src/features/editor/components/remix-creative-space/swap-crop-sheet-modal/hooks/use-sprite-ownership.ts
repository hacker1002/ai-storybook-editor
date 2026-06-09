// use-sprite-ownership.ts — Resolve per-cell cross-sprite ownership state for
// the Variants tab AFTER pane. Sprite-plane sibling of `use-crop-ownership.ts`.
// Pure derivation over `remix.sprites` + `currentSpriteId`.
//
// `getOwnership(cropKey)` takes the sprite cellKey
// `${type}/${object_key}/${variant_key}` (matches the VariantsTab `cropKeyOf`).
// Output shape reuses `CropOwnershipState` — `ownerBatchId`/`ownerBatchName`
// carry the OWNER SPRITE id/name (field names kept for component reuse).
//
// Memo keyed on the raw `remix.sprites` ref (memory
// feedback_zustand_useshallow_nested_arrays). Output is a stable callable — do
// NOT wrap in useShallow (feedback_zustand_useshallow_inline_arrows).

import { useMemo } from 'react';
import type { Remix } from '@/types/remix';
import { resolveSpriteOwners } from '@/stores/remix-store/sprite-ownership';
import type { CropOwnership, CropOwnershipState } from './use-crop-ownership';

const UNCOVERED: CropOwnershipState = { state: 'uncovered' };

export function useSpriteOwnership(
  remix: Remix | null | undefined,
  currentSpriteId: string | null | undefined,
): CropOwnership {
  const sprites = remix?.sprites;

  const spriteNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (!sprites) return map;
    for (const s of sprites) map.set(s.id, s.name ?? `Sprite ${s.order + 1}`);
    return map;
  }, [sprites]);

  const ownerMap = useMemo(() => {
    const map = new Map<string, { ownerBatchId: string; ownerBatchName: string }>();
    const owners = resolveSpriteOwners(sprites);
    for (const [cellKey, owner] of owners.entries()) {
      map.set(cellKey, {
        ownerBatchId: owner.spriteId,
        ownerBatchName: spriteNameById.get(owner.spriteId) ?? owner.spriteId,
      });
    }
    return map;
  }, [sprites, spriteNameById]);

  const getOwnership = useMemo(() => {
    return (cropKey: string): CropOwnershipState => {
      const owner = ownerMap.get(cropKey);
      if (!owner) return UNCOVERED;
      if (currentSpriteId && owner.ownerBatchId === currentSpriteId) {
        return {
          state: 'owned-current',
          ownerBatchId: owner.ownerBatchId,
          ownerBatchName: owner.ownerBatchName,
        };
      }
      return {
        state: 'owned-foreign',
        ownerBatchId: owner.ownerBatchId,
        ownerBatchName: owner.ownerBatchName,
      };
    };
  }, [ownerMap, currentSpriteId]);

  return { ownerMap, getOwnership };
}
