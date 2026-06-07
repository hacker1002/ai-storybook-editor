// background-jobs-store/top-up.ts — Reconnect / mount top-up: realtime never
// replays events missed while the channel was down, so on (re)subscribe we pull
// active + recent-terminal rows and ingest them. Two queries (union locally)
// instead of a nested `.or(and(...))` — PostgREST nested boolean filters with
// timestamp values are brittle under URL serialization.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import { mapRowToBackgroundJob } from './ingest';
import { TOP_UP_WINDOW_MS, type BackgroundJob, type BackgroundJobRawRow } from './types';

const log = createLogger('Store', 'BackgroundJobsTopUp');

/** Pull active (queued|running, any age) + recent-terminal (≤30m) jobs for the
 *  user and feed them through `ingest`. Idempotent (ingest reconciles by id). */
export async function topUpSync(
  userId: string,
  ingest: (rows: BackgroundJob[]) => void,
): Promise<void> {
  const cutoffIso = new Date(Date.now() - TOP_UP_WINDOW_MS).toISOString();
  log.debug('topUpSync', 'fetch', { userId });

  const [activeRes, terminalRes] = await Promise.all([
    supabase
      .from('background_jobs')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['queued', 'running'])
      .order('created_at', { ascending: true }),
    supabase
      .from('background_jobs')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['completed', 'failed', 'cancelled'])
      .gte('updated_at', cutoffIso)
      .order('created_at', { ascending: true }),
  ]);

  if (activeRes.error) {
    log.error('topUpSync', 'active fetch failed', {
      userId,
      error: activeRes.error.message,
    });
    return;
  }
  if (terminalRes.error) {
    log.error('topUpSync', 'terminal fetch failed', {
      userId,
      error: terminalRes.error.message,
    });
    return;
  }

  const rows = [
    ...((activeRes.data ?? []) as BackgroundJobRawRow[]),
    ...((terminalRes.data ?? []) as BackgroundJobRawRow[]),
  ].map(mapRowToBackgroundJob);

  log.info('topUpSync', 'done', {
    userId,
    active: activeRes.data?.length ?? 0,
    terminal: terminalRes.data?.length ?? 0,
  });
  if (rows.length > 0) ingest(rows);
}
