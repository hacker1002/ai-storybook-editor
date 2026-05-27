// remix-store/slice-helpers.ts — Pure helpers shared across ≥2 slices and the
// selector layer. Kept out of any single slice so the format never drifts
// between the action that writes and the selector that reads.

import type { RemixCropSheet, RemixJob } from '@/types/remix';
import type { CropSheetUpdate } from './types';

/** Collapse `jobs[]` to the latest job per swap lineage
 *  (`remixId + phase + characterKey + batchId`). A newer attempt SUPERSEDES
 *  older ones for the same target, so older siblings are dropped.
 *
 *  WHY: `deriveBatchSwapTask` / `useLatestAudioJob` resolve the "current" task by
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
    // Lineage folds characterKey (char-swap) and batchId (remix_mix_swap) so
    // two distinct batch swaps don't prune each other. Both undefined for
    // audio/image → '' (all attempts collapse to latest).
    const lineage = `${job.remixId}|${job.phase}|${job.characterKey ?? ''}|${job.batchId ?? ''}`;
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
