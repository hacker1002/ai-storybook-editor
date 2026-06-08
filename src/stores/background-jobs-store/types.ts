// background-jobs-store/types.ts — Domain shape for the unified BackgroundJobs
// store (ADR-037). The store is domain-agnostic: it keeps raw `params`/`result`
// passthrough and never hoists a domain field. Consumers (RemixStore, export
// watcher, notification hook) read `params.remix_id` / `params.edition` etc.

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Transition computed by the store on each ingest (prev ↔ incoming) so
 *  listeners don't track prior state themselves.
 *  - appeared : id never seen before (INSERT / first observation / seed)
 *  - running  : queued → running (first time)
 *  - updated  : running → running (step/progress tick) — or any non-classified active move
 *  - terminal : active → completed|failed|cancelled
 *  - removed  : row dropped from the store (DELETE event / 30s auto-dismiss) so
 *               materialized consumers (remix jobs[]) can drop their copy. */
export type JobTransition = 'appeared' | 'running' | 'updated' | 'terminal' | 'removed';

/** Camel-cased passthrough of a `public.background_jobs` row. NO domain fields
 *  hoisted — `params`/`result` stay raw so the store never couples to a type. */
export interface BackgroundJob {
  id: string;
  type: string; // 'remix_audio_swap' | 'render_book_video' | 'transcode_video' | 'export_pdf' | ...
  bookId: string | null;
  userId: string;
  status: JobStatus;
  currentStep: number;
  totalSteps: number;
  stepDetails: Record<string, unknown> | null; // per-type shape — consumer parses
  params: Record<string, unknown> | null; // raw — consumer reads remix_id/edition/character_key/batch_id
  result: Record<string, unknown> | null; // <10KB (realtime cap) — NOT for dispatch
  cancelRequested: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface JobEvent {
  job: BackgroundJob;
  prev: BackgroundJob | null;
  transition: JobTransition;
}

/** Consumer-declared interest filter. Reads raw fields. Pass a stable (memoized)
 *  predicate to `useJobsBy` when using `match` — the reactive selector can only
 *  memo on the serializable fields (types/bookId/remixId). */
export interface JobPredicate {
  types?: string[]; // allowlist by job.type
  bookId?: string | null; // match job.bookId (undefined = ignore)
  remixId?: string; // match job.params.remix_id
  match?: (job: BackgroundJob) => boolean; // escape hatch
}

export type JobListener = (event: JobEvent) => void;

/** Raw `public.background_jobs` row as returned by Supabase select + realtime
 *  payload (snake_case). Kept generic (no remix-typed params) to stay
 *  domain-agnostic. */
export interface BackgroundJobRawRow {
  id: string;
  type: string;
  user_id: string;
  book_id: string | null;
  status: JobStatus;
  cancel_requested: boolean | null;
  total_steps: number | null;
  current_step: number | null;
  step_details: Record<string, unknown> | null;
  params: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);
export const ACTIVE_STATUSES: ReadonlySet<JobStatus> = new Set(['queued', 'running']);

// ── Shared job-type allowlists (consumers import these) ──────────────────────

/** Remix swap job types — RemixStore consumer subscribes to exactly these so
 *  render/transcode/pdf never leak into the remix `jobs[]` (phantom-job fix). */
export const REMIX_SWAP_TYPES = [
  'remix_audio_swap',
  'remix_mix_swap',
] as const;

/** Distribution export job types — export watcher subscribes to these. Includes
 *  `transcode_video` (auto-chained after `render_book_video`, ADR-037). */
export const EXPORT_TYPES = [
  'export_pdf',
  'render_book_video',
  'transcode_video',
] as const;

/** Top-up / GC retention window: active jobs are caught regardless of age (via
 *  the active-status query); terminal jobs older than this are pruned + missed
 *  on reconnect top-up. 30m (wider than the legacy 5m) catches a job that just
 *  finished while the user was away. */
export const TOP_UP_WINDOW_MS = 30 * 60 * 1000;
