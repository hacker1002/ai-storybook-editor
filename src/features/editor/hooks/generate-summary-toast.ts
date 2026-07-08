// generate-summary-toast.ts — shared summary-count helpers for the sketch generate-job
// notification toasts (entity sheets + spread images). Both jobs end with the same
// "done/total generated · K skipped · M failed" roll-up shape; this keeps that copy DRY.

import type {
  SketchGenerateJob,
  SketchSpreadGenerateJob,
} from '@/stores/snapshot-store/types';

export interface GenerateSummaryCounts {
  /** tasks that produced a result. */
  done: number;
  /** targets 409-blocked by another editor (collab) — distinct from failures. */
  skipped: number;
  /** genuine generation failures (error tasks that are NOT skips). */
  fail: number;
  /** total tasks enqueued. */
  total: number;
}

/**
 * Split a finished generate job's tasks into done / skipped / fail / total. `skipped`
 * comes from the job-level counter (targets blocked by another editor); `fail` excludes
 * those skips so the two never double-count.
 */
export function summarizeGenerateJob(
  job: SketchGenerateJob | SketchSpreadGenerateJob,
): GenerateSummaryCounts {
  const done = job.tasks.filter((t) => t.status === 'completed').length;
  const skipped = job.skipped ?? 0;
  const fail = job.tasks.filter((t) => t.status === 'error' && !t.skipped).length;
  return { done, skipped, fail, total: job.tasks.length };
}

/**
 * Trailing " · K skipped (being edited) · M failed" clause for a summary toast.
 * Empty string when there is nothing extra to report.
 */
export function generateSummarySuffix(skipped: number, fail: number): string {
  let suffix = '';
  if (skipped > 0) suffix += ` · ${skipped} skipped (being edited)`;
  if (fail > 0) suffix += ` · ${fail} failed`;
  return suffix;
}
