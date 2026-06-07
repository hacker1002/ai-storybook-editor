// background-jobs-store/ingest.ts — Pure ingest helpers: raw row → domain shape,
// transition classification, predicate matching. No I/O, no store access.

import {
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  type BackgroundJob,
  type BackgroundJobRawRow,
  type JobPredicate,
  type JobTransition,
} from './types';

/** Map a raw `background_jobs` row (snake_case) → `BackgroundJob` (camelCase
 *  passthrough). Pure. `params`/`result`/`step_details` kept raw. */
export function mapRowToBackgroundJob(row: BackgroundJobRawRow): BackgroundJob {
  return {
    id: row.id,
    type: row.type,
    bookId: row.book_id ?? null,
    userId: row.user_id,
    status: row.status,
    currentStep: row.current_step ?? 0,
    totalSteps: row.total_steps ?? 0,
    stepDetails: row.step_details ?? null,
    params: row.params ?? null,
    result: row.result ?? null,
    cancelRequested: !!row.cancel_requested,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Classify the transition between the previously-known job state and the
 *  incoming row. See `JobTransition` for the contract. */
export function classifyTransition(
  prev: BackgroundJob | null,
  next: BackgroundJob,
): JobTransition {
  if (prev === null) return 'appeared';
  if (ACTIVE_STATUSES.has(prev.status) && TERMINAL_STATUSES.has(next.status)) {
    return 'terminal';
  }
  if (prev.status === 'queued' && next.status === 'running') return 'running';
  return 'updated';
}

/** True when a job matches a consumer predicate. Empty predicate matches all. */
export function matches(predicate: JobPredicate, job: BackgroundJob): boolean {
  if (predicate.types && !predicate.types.includes(job.type)) return false;
  if (predicate.bookId !== undefined && job.bookId !== predicate.bookId) return false;
  if (predicate.remixId) {
    const remixId = job.params?.remix_id;
    if (remixId !== predicate.remixId) return false;
  }
  if (predicate.match && !predicate.match(job)) return false;
  return true;
}
