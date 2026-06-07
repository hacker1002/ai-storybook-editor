// map-background-job-row.ts — Pure converter from raw `public.background_jobs`
// row (snake_case, DB enum) to `RemixJob` camelCase domain shape consumed by
// the store + selectors.

import type { BackgroundJobRow, RemixJob, RemixJobPhase, RemixJobResult } from '@/types/remix';
import type { BackgroundJob } from '@/stores/background-jobs-store';

const TERMINAL_STATUSES = new Set<RemixJob['status']>([
  'completed',
  'failed',
  'cancelled',
]);

/** Extensible job-type → phase lookup. Add a new entry per job type — do NOT
 *  reintroduce if/else. Prop/mix swap will ship under distinct types
 *  (`remix_prop_swap`/`remix_mix_swap`) → one new line each. Unknown types fall
 *  back to `'audio'` (legacy default). NOTE: `remix_entity_swap` is intentionally
 *  ABSENT — that type was never enabled in prod (Validation S1, no backward-compat). */
const JOB_TYPE_TO_PHASE: Record<string, RemixJobPhase> = {
  remix_audio_swap: 'audio',
  remix_character_swap: 'character_swap',
  remix_mix_swap: 'remix_mix_swap',
};

/** Map raw background_jobs row → RemixJob. Pure, no I/O. */
export function mapRowToJob(row: BackgroundJobRow): RemixJob {
  const phase: RemixJobPhase = JOB_TYPE_TO_PHASE[row.type] ?? 'audio';

  const triggeredBy =
    row.params?.triggered_by === 'auto-create' ? 'auto-create' : 'user';

  const remixId =
    typeof row.params?.remix_id === 'string' ? row.params.remix_id : '';

  // Surface `params.character_key` onto the domain shape for character_swap
  // jobs so selectors can match the running swap to its character row.
  const characterKey =
    typeof row.params?.character_key === 'string'
      ? row.params.character_key
      : undefined;

  // Surface `params.batch_id` for remix_mix_swap jobs so selectors can match
  // the running swap to its batch row.
  const batchId =
    typeof row.params?.batch_id === 'string' ? row.params.batch_id : undefined;

  return {
    id: row.id,
    remixId,
    phase,
    characterKey,
    batchId,
    triggeredBy,
    status: row.status,
    currentStep: row.current_step ?? 0,
    totalSteps: row.total_steps ?? 0,
    stepDetails: row.step_details ?? undefined,
    result: row.result ?? undefined,
    cancelRequested: !!row.cancel_requested,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: TERMINAL_STATUSES.has(row.status) ? row.updated_at : undefined,
  };
}

/** Map a camel-cased `BackgroundJob` (from the unified BackgroundJobsStore) →
 *  `RemixJob`. ADR-037 consumer adapter — avoids a snake-case round-trip. Only
 *  ever receives the 3 remix swap types (the consumer predicate filters), so the
 *  `'audio'` fallback never matches a foreign type. */
export function mapBackgroundJobToRemixJob(job: BackgroundJob): RemixJob {
  const phase: RemixJobPhase = JOB_TYPE_TO_PHASE[job.type] ?? 'audio';
  const params = job.params ?? {};

  const triggeredBy = params.triggered_by === 'auto-create' ? 'auto-create' : 'user';
  const remixId = typeof params.remix_id === 'string' ? params.remix_id : '';
  const characterKey =
    typeof params.character_key === 'string' ? params.character_key : undefined;
  const batchId = typeof params.batch_id === 'string' ? params.batch_id : undefined;

  return {
    id: job.id,
    remixId,
    phase,
    characterKey,
    batchId,
    triggeredBy,
    status: job.status,
    currentStep: job.currentStep,
    totalSteps: job.totalSteps,
    stepDetails: (job.stepDetails as RemixJob['stepDetails']) ?? undefined,
    result: (job.result as RemixJobResult | null) ?? undefined,
    cancelRequested: job.cancelRequested,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: TERMINAL_STATUSES.has(job.status) ? job.updatedAt : undefined,
  };
}
