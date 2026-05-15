// realtime.ts — Supabase Realtime subscription to public.background_jobs,
// filtered to current user's rows. Polling fallback (5s) when channel reports
// CHANNEL_ERROR; cleared when channel recovers (SUBSCRIBED).
// Spec: ai-storybook-design/component/stores/remix-store.md §4.1, §6.1

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type {
  BackgroundJobRow,
  RemixServerEvent,
} from '@/types/remix';

const log = createLogger('Store', 'RemixRealtime');

const POLL_INTERVAL_MS = 5000;

interface BackgroundJobsSubscription {
  channel: RealtimeChannel;
  stopPolling: () => void;
}

/** Push current session JWT into supabase-js realtime client. Required so the
 *  RLS-protected `background_jobs` postgres_changes events actually reach the
 *  subscriber — without this the channel subscribes anonymously and the
 *  server-side filter silently drops every event. */
async function ensureRealtimeAuth(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      log.warn('ensureRealtimeAuth', 'getSession failed', { error: error.message });
      return;
    }
    const token = data.session?.access_token;
    if (!token) {
      log.warn('ensureRealtimeAuth', 'no access_token on session');
      return;
    }
    supabase.realtime.setAuth(token);
    log.debug('ensureRealtimeAuth', 'realtime auth set');
  } catch (err) {
    log.warn('ensureRealtimeAuth', 'unexpected', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Subscribe to background_jobs INSERT/UPDATE/DELETE for given user.
 *  Starts polling fallback (calls onPoll every 5s) when channel errors out;
 *  stops polling once channel re-subscribes successfully. */
export function subscribeBackgroundJobs(
  userId: string,
  onEvent: (event: RemixServerEvent) => void,
  onPoll: () => void,
): BackgroundJobsSubscription {
  log.info('subscribeBackgroundJobs', 'open', { userId });

  // Fire-and-forget: push current JWT into realtime before subscribing.
  // The .subscribe() call below is sync, but auth setting before the WebSocket
  // upgrade negotiation lands in time for the actual JOIN frame.
  void ensureRealtimeAuth();

  let pollId: ReturnType<typeof setInterval> | null = null;

  const startPolling = () => {
    if (pollId !== null) return;
    log.warn('subscribeBackgroundJobs', 'channel down — starting polling fallback', {
      userId,
      intervalMs: POLL_INTERVAL_MS,
    });
    pollId = setInterval(() => {
      try {
        onPoll();
      } catch (err) {
        log.error('subscribeBackgroundJobs', 'poll tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, POLL_INTERVAL_MS);
  };

  const stopPolling = () => {
    if (pollId === null) return;
    log.info('subscribeBackgroundJobs', 'channel recovered — stopping polling', { userId });
    clearInterval(pollId);
    pollId = null;
  };

  const channel = supabase
    .channel(`bg-jobs-${userId}`)
    .on(
      'postgres_changes' as never,
      {
        event: '*',
        schema: 'public',
        table: 'background_jobs',
        filter: `user_id=eq.${userId}`,
      },
      (payload: {
        eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
        new?: BackgroundJobRow;
        old?: { id?: string };
      }) => {
        const eventType = payload.eventType;
        if (eventType === 'DELETE') {
          const id = payload.old?.id;
          if (!id) {
            log.warn('subscribeBackgroundJobs', 'DELETE without id — skip');
            return;
          }
          log.debug('subscribeBackgroundJobs', 'job_delete', { id });
          onEvent({ type: 'job_delete', id });
          return;
        }
        const row = payload.new;
        if (!row) {
          log.warn('subscribeBackgroundJobs', 'event without row payload', { eventType });
          return;
        }
        log.debug('subscribeBackgroundJobs', 'job_upsert', {
          eventType,
          jobId: row.id,
          status: row.status,
        });
        onEvent({ type: 'job_upsert', row });
      },
    )
    .subscribe((status) => {
      log.info('subscribeBackgroundJobs', 'status', { userId, status });
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        startPolling();
      } else if (status === 'SUBSCRIBED') {
        stopPolling();
        // Top-up immediately on (re)subscribe; missed events between channel
        // down and back up are not replayed by Supabase realtime.
        try {
          onPoll();
        } catch (err) {
          log.error('subscribeBackgroundJobs', 'top-up sync failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });

  return { channel, stopPolling };
}

/** Tear down channel + polling fallback. Idempotent. */
export function unsubscribeBackgroundJobs(sub: BackgroundJobsSubscription): void {
  log.info('unsubscribeBackgroundJobs', 'close');
  sub.stopPolling();
  void supabase.removeChannel(sub.channel);
}
