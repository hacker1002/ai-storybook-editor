// activity-log-client.ts — client-direct writer for `collaboration_activity_logs`
// summary audit rows (generate jobs). Mirrors the login/comment write model
// (DATABASE-SCHEMA §collaboration_activity_logs): the CLIENT inserts rows whose
// `actor_user_id = auth.uid()` (RLS `WITH CHECK actor_user_id = auth.uid() AND
// member`). CRUD data lands via the save-endpoint (service-role, `log:false` for
// per-target generate writes); this helper writes the SINGLE summary row per job.
//
// WHY A SUMMARY ROW (not per-target): a generate job writes N targets via the
// gateway `save` with `log:false` (data-only, no audit). To keep the activity feed
// readable, the job appends exactly ONE roll-up row (action `upload`) here at the end.
//
// BEST-EFFORT: a failed insert is warned + swallowed (never throws). The audit trail
// is advisory (client rows are forgeable within the actor's own scope anyway); data
// integrity never depends on it. Callers do NOT await-block their happy path on it.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'ActivityLogClient');

/** action_type=5 (upload) — used for generate-job summary rows (verbatim DB enum). */
export const ACTION_TYPE_UPLOAD = 5;
/** target_type=1 (spread) — spread-image generate summary. */
export const TARGET_TYPE_SPREAD = 1;
/** target_type=4 (entity) — character/prop/stage sheet generate summary. */
export const TARGET_TYPE_ENTITY = 4;

export interface GenerateSummaryLogParams {
  bookId: string;
  actorId: string;
  /** crud enum — generate summaries use ACTION_TYPE_UPLOAD (5). */
  actionType: number;
  /** target enum — TARGET_TYPE_ENTITY (4) | TARGET_TYPE_SPREAD (1). */
  targetType: number;
  /** roll-up ref, e.g. { kind, entities:[…], count } | { spread_numbers:[…], count }. */
  targetRef: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Append ONE summary audit row for a completed generate job. No-op (warn) when
 * bookId/actorId are missing. Best-effort: never throws — a rejected insert is a
 * warn only (RLS enforces actor=auth.uid(); the client cannot forge other actors).
 */
export async function insertGenerateSummaryLog(params: GenerateSummaryLogParams): Promise<void> {
  const { bookId, actorId, actionType, targetType, targetRef, metadata } = params;
  if (!bookId || !actorId) {
    log.warn('insertGenerateSummaryLog', 'missing bookId/actorId — skip summary row', {
      hasBookId: !!bookId,
      hasActorId: !!actorId,
    });
    return;
  }

  log.info('insertGenerateSummaryLog', 'append generate summary row', {
    bookId,
    actionType,
    targetType,
    count: targetRef.count,
  });
  try {
    const { error } = await supabase.from('collaboration_activity_logs').insert({
      book_id: bookId,
      actor_user_id: actorId,
      action_type: actionType,
      target_type: targetType,
      target_ref: targetRef,
      metadata: metadata ?? null,
    });
    if (error) {
      log.warn('insertGenerateSummaryLog', 'summary audit insert failed (best-effort)', {
        bookId,
        error: error.message,
      });
      return;
    }
    log.debug('insertGenerateSummaryLog', 'summary row written', { bookId });
  } catch (err) {
    // Network / unexpected — swallow (audit is advisory).
    log.warn('insertGenerateSummaryLog', 'summary audit insert threw (best-effort)', {
      bookId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
