// map-background-job-row.ts — Pure converter from raw `public.background_jobs`
// row (snake_case, DB enum) to `RemixJob` camelCase domain shape consumed by
// the store + selectors.

import type { BackgroundJobRow, RemixJob, RemixJobPhase } from '@/types/remix';

const TERMINAL_STATUSES = new Set<RemixJob['status']>([
  'completed',
  'failed',
  'cancelled',
]);

/** Map raw background_jobs row → RemixJob. Pure, no I/O. */
export function mapRowToJob(row: BackgroundJobRow): RemixJob {
  const phase: RemixJobPhase =
    row.type === 'remix_image_swap'
      ? 'image'
      : row.type === 'remix_entity_swap'
        ? 'entity_swap'
        : 'audio';

  const triggeredBy =
    row.params?.triggered_by === 'auto-create' ? 'auto-create' : 'user';

  const remixId =
    typeof row.params?.remix_id === 'string' ? row.params.remix_id : '';

  return {
    id: row.id,
    remixId,
    phase,
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
