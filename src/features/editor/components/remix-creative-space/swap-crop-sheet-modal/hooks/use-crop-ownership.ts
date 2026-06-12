// use-crop-ownership.ts — Resolve per-crop ownership state for a stage tab's
// AFTER pane (⚡2026-06-12 — PER-STAGE mutex: the `is_final` winner set is
// scoped to ONE stage column `remix[stage]`, never cross-stage).
//
// Memo keyed on the raw `remix[stage]` reference (not a freshly-built object —
// per memory `feedback_zustand_useshallow_nested_arrays`). Hook output is a
// stable callable `getOwnership(cropKey)` — consumers do NOT wrap it in
// `useShallow` (per `feedback_zustand_useshallow_inline_arrows`).

import { useMemo } from 'react';
import type { Remix, StageKind } from '@/types/remix';
import { resolveFinalCropsOfRows } from '@/stores/remix-store/selectors/select-final-crops';

export type CropOwnershipState =
  | { state: 'owned-current'; ownerBatchId: string; ownerBatchName: string }
  | { state: 'owned-foreign'; ownerBatchId: string; ownerBatchName: string }
  | { state: 'uncovered' };

export interface CropOwnership {
  ownerMap: ReadonlyMap<string, { ownerBatchId: string; ownerBatchName: string }>;
  /** Resolve ownership by cropKey (`${spread_id}/${layer_id}` for the stage
   *  plane, matching `defaultMixCropKey`). The sprite plane has its own hook
   *  (`useSpriteOwnership`) keyed by `${type}/${object_key}/${variant_key}`. */
  getOwnership: (cropKey: string) => CropOwnershipState;
}

const UNCOVERED: CropOwnershipState = { state: 'uncovered' };

export function useCropOwnership(
  remix: Remix | null | undefined,
  stage: StageKind,
  currentBatchId: string | null | undefined,
): CropOwnership {
  // Re-compute only when the underlying stage-column reference changes (the
  // store emits a fresh array on mutation). batch.name derives from the same
  // reference so we don't need a separate dep.
  const rows = remix?.[stage];
  const batchNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (!rows) return map;
    for (const b of rows) map.set(b.id, b.name ?? `Batch ${b.order + 1}`);
    return map;
  }, [rows]);

  const ownerMap = useMemo(() => {
    const map = new Map<string, { ownerBatchId: string; ownerBatchName: string }>();
    if (!rows) return map;
    for (const entry of resolveFinalCropsOfRows(rows)) {
      const key = `${entry.spread_id}/${entry.layer_id}`;
      const ownerBatchName = batchNameById.get(entry.batch_id) ?? entry.batch_id;
      map.set(key, { ownerBatchId: entry.batch_id, ownerBatchName });
    }
    return map;
  }, [rows, batchNameById]);

  const getOwnership = useMemo(() => {
    return (cropKey: string): CropOwnershipState => {
      const owner = ownerMap.get(cropKey);
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
