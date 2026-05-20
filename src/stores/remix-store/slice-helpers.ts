// remix-store/slice-helpers.ts — Pure helpers shared across ≥2 slices and the
// selector layer. Kept out of any single slice so the format never drifts
// between the action that writes and the selector that reads.

import type {
  EntitySwapTaskKey,
  Remix,
  RemixCropSheet,
  SwapTaskStatus,
} from '@/types/remix';
import { canonicalMixKey } from '@/types/remix';
import type { CropSheetUpdate } from './types';

/** Composes the `entitySwapTasks` map key (per-KEY, not per-sheet). Shared
 *  between swap action + selector so the format never drifts. */
export function buildEntityTaskKey(
  remixId: string,
  type: 'character' | 'prop' | 'mix',
  key: string,
): EntitySwapTaskKey {
  return `${remixId}:${type}:${key}`;
}

/** Stable reference for the default idle task — avoids a fresh object per
 *  `useEntitySwapTask` call (would defeat selector re-render guards). */
export const IDLE_SWAP_TASK: SwapTaskStatus = { state: 'idle' };

/** Applies one `CropSheetUpdate` onto an entity's `crop_sheets[]`. Handles
 *  both discriminated kinds:
 *   - `patch`: merges `patch` into `crop_sheets[sheetIndex]` (single-sheet).
 *   - `replaceAll`: replaces the entire `crop_sheets[]` array (variant
 *     relayout — sheet count + ordering both change). */
export function applySheetPatch<T extends { crop_sheets: RemixCropSheet[] }>(
  entity: T,
  update: CropSheetUpdate,
): T {
  if (update.kind === 'replaceAll') {
    return { ...entity, crop_sheets: update.sheets };
  }
  return {
    ...entity,
    crop_sheets: entity.crop_sheets.map((sheet, idx) =>
      idx === update.sheetIndex ? { ...sheet, ...update.patch } : sheet,
    ),
  };
}

/** Normalized projection of one remix entity (character | prop | mix). Used by
 *  `startEntitySwap` resolution and selectors so the shape never drifts. */
export type ResolvedEntity = {
  name: string;
  crop_sheets: RemixCropSheet[];
};

/** Resolves a single entity from a remix by type + key. Mix matches by
 *  `canonicalMixKey(keys)`. Returns `null` when the entity is missing. */
export function resolveEntity(
  remix: Remix,
  type: 'character' | 'prop' | 'mix',
  key: string,
): ResolvedEntity | null {
  if (type === 'character') {
    return remix.characters.find((c) => c.key === key) ?? null;
  }
  if (type === 'prop') {
    return remix.props.find((p) => p.key === key) ?? null;
  }
  return remix.mixes.find((m) => canonicalMixKey(m.keys) === key) ?? null;
}
