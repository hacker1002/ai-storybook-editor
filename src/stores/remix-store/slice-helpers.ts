// remix-store/slice-helpers.ts — Pure helpers shared across ≥2 slices and the
// selector layer. Kept out of any single slice so the format never drifts
// between the action that writes and the selector that reads.

import type { Remix, RemixCropSheet, RemixJob, SwapTaskStatus } from '@/types/remix';
import { canonicalMixKey } from '@/types/remix';
import type { CropSheetUpdate } from './types';

/** Stable reference for the default idle task — avoids a fresh object per
 *  `useEntitySwapTask` call (would defeat the selector's value-compare guard). */
export const IDLE_SWAP_TASK: SwapTaskStatus = { state: 'idle' };

/** Collapse `jobs[]` to the latest job per swap lineage
 *  (`remixId + phase + characterKey`). A newer attempt SUPERSEDES older ones for
 *  the same target, so older siblings are dropped.
 *
 *  WHY: `useEntitySwapTask` / `useLatestAudioJob` resolve the "current" task by
 *  picking the latest-by-`createdAt` matching job. A partial/failed job is
 *  `status='completed'` (per-sheet partial-success contract) and is NEVER
 *  auto-dismissed, so it lingers. When a newer CLEAN-complete job is later
 *  auto-dismissed (30s), the selector falls back to the stale failed sibling
 *  and the error banner RESURRECTS even though the latest attempt succeeded.
 *  Keeping only the newest job per lineage makes the stored set match what the
 *  selector reads, so dismissal can't expose an older failure.
 *
 *  Lineage key folds `characterKey` (undefined for audio/image → ''), so all
 *  audio attempts of a remix collapse to the latest — matching
 *  `useLatestAudioJob` semantics. Returns the SAME array ref when nothing is
 *  pruned (avoids spurious store churn). */
export function pruneSupersededJobs(jobs: RemixJob[]): RemixJob[] {
  const latestByLineage = new Map<string, RemixJob>();
  for (const job of jobs) {
    const lineage = `${job.remixId}|${job.phase}|${job.characterKey ?? ''}`;
    const cur = latestByLineage.get(lineage);
    if (!cur || job.createdAt > cur.createdAt) latestByLineage.set(lineage, job);
  }
  if (latestByLineage.size === jobs.length) return jobs;
  const survivors = new Set(latestByLineage.values());
  return jobs.filter((j) => survivors.has(j));
}

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
