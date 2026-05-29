// use-crop-ownership.ts — Resolve per-crop cross-batch ownership state for the
// Batches tab AFTER pane. Pure derivation over `remix.mixes` + `currentBatchId`.
//
// Memo keyed on the raw `remix.mixes` reference (not a freshly-built object —
// per memory `feedback_zustand_useshallow_nested_arrays`). Hook output is a
// stable callable `getOwnership(spreadId, layerId)` — consumers do NOT wrap it
// in `useShallow` (per `feedback_zustand_useshallow_inline_arrows`).

import { useMemo } from 'react';
import type { Remix } from '@/types/remix';
import { resolveFinalCrops } from '@/stores/remix-store/selectors/select-final-crops';

export type CropOwnershipState =
  | { state: 'owned-current'; ownerBatchId: string; ownerBatchName: string }
  | { state: 'owned-foreign'; ownerBatchId: string; ownerBatchName: string }
  | { state: 'uncovered' };

export interface CropOwnership {
  ownerMap: ReadonlyMap<string, { ownerBatchId: string; ownerBatchName: string }>;
  getOwnership: (spreadId: string, layerId: string) => CropOwnershipState;
}

const UNCOVERED: CropOwnershipState = { state: 'uncovered' };

export function useCropOwnership(
  remix: Remix | null | undefined,
  currentBatchId: string | null | undefined,
): CropOwnership {
  // Re-compute only when the underlying mixes reference changes (immer/store
  // emits a fresh array on mutation). batch.name is derived from the same
  // reference so we don't need a separate dep.
  const mixes = remix?.mixes;
  const batchNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (!mixes) return map;
    for (const b of mixes) map.set(b.id, b.name ?? `Batch ${b.order + 1}`);
    return map;
  }, [mixes]);

  const ownerMap = useMemo(() => {
    const map = new Map<string, { ownerBatchId: string; ownerBatchName: string }>();
    if (!remix) return map;
    for (const entry of resolveFinalCrops(remix)) {
      const key = `${entry.spread_id}/${entry.layer_id}`;
      const ownerBatchName = batchNameById.get(entry.batch_id) ?? entry.batch_id;
      map.set(key, { ownerBatchId: entry.batch_id, ownerBatchName });
    }
    return map;
  }, [remix, batchNameById]);

  const getOwnership = useMemo(() => {
    return (spreadId: string, layerId: string): CropOwnershipState => {
      const key = `${spreadId}/${layerId}`;
      const owner = ownerMap.get(key);
      if (!owner) return UNCOVERED;
      if (currentBatchId && owner.ownerBatchId === currentBatchId) {
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
  }, [ownerMap, currentBatchId]);

  return { ownerMap, getOwnership };
}
