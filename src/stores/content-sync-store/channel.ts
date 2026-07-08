// content-sync-store/channel.ts — Single Supabase Realtime channel for the
// `collaboration_activity_logs` INSERTs of one book (the audit log used as a
// content change-feed). Mirrors resource-lock-store/channel.ts, with two
// deliberate differences:
//   1. Subscribes ONLY to INSERT (the log is append-only) — no UPDATE/DELETE and
//      no reseed/heartbeat/prune: a missed event while offline is accepted
//      display-staleness, healed by the next event or on re-enter.
//   2. The channel ref is assigned SYNCHRONOUSLY right after the fire-and-forget
//      `ensureRealtimeAuth()` — NEVER inside an async IIFE — so `teardown()`
//      always has a ref even mid-subscribe (await-before-channel would leave
//      cleanup with null → leaked duplicate-topic channel that never listens —
//      memory reference_supabase_realtime_sync_channel).
// Down → exp-backoff reheal (base 1s → max 15s); SUBSCRIBED → reset backoff.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/apis/supabase';
import { ensureRealtimeAuth } from '@/apis/supabase-realtime';
import { createLogger } from '@/utils/logger';
import type { ActivityLogRawRow } from './types';

const log = createLogger('Store', 'ActivityLogChannel');

const REHEAL_BASE_MS = 1000;
const REHEAL_MAX_MS = 15_000;

export interface ActivityLogChannelArgs {
  bookId: string;
  onInsert: (row: ActivityLogRawRow) => void; // INSERT only (append-only feed)
  onLive: () => void; // SUBSCRIBED
  onDown: () => void; // CHANNEL_ERROR / TIMED_OUT / CLOSED
}

export interface ChannelHandle {
  teardown: () => void;
}

/** Open the single per-book activity-log channel with exp-backoff reheal.
 *  Returns a `teardown()` safe to call at any time (including mid-subscribe). */
export function openActivityLogChannel(args: ActivityLogChannelArgs): ChannelHandle {
  const { bookId, onInsert, onLive, onDown } = args;

  let cancelled = false;
  let channel: RealtimeChannel | null = null;
  let rehealTimer: ReturnType<typeof setTimeout> | null = null;
  let rehealAttempts = 0;

  const scheduleReheal = () => {
    const dead = channel;
    channel = null;
    if (dead) void supabase.removeChannel(dead);
    if (rehealTimer) clearTimeout(rehealTimer);
    rehealAttempts += 1;
    const delay = Math.min(REHEAL_BASE_MS * 2 ** (rehealAttempts - 1), REHEAL_MAX_MS);
    log.warn('scheduleReheal', 'channel down, rehealing', { bookId, attempt: rehealAttempts, delayMs: delay });
    rehealTimer = setTimeout(() => subscribe(), delay);
  };

  const subscribe = () => {
    if (cancelled) return;
    // Fire-and-forget JWT push BEFORE the (sync) .subscribe() so the JOIN frame
    // carries auth — else the channel joins anonymously and RLS silently drops
    // every INSERT event (non-owner collaborator would see nothing).
    void ensureRealtimeAuth();

    log.info('subscribe', 'open activity-log channel', { bookId, attempt: rehealAttempts });
    channel = supabase
      .channel(`activity_logs:${bookId}`)
      .on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'collaboration_activity_logs',
          filter: `book_id=eq.${bookId}`,
        },
        (payload: { new?: ActivityLogRawRow }) => {
          if (cancelled) return;
          if (payload.new) onInsert(payload.new);
        },
      )
      .subscribe((status, err) => {
        if (cancelled) return;
        log.debug('subscribe', 'status', { bookId, status, err: err?.message ?? null });
        if (status === 'SUBSCRIBED') {
          rehealAttempts = 0;
          onLive();
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onDown();
          scheduleReheal();
        }
      });
  };

  subscribe();

  return {
    teardown: () => {
      cancelled = true;
      log.info('teardown', 'close activity-log channel', { bookId });
      if (rehealTimer) clearTimeout(rehealTimer);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    },
  };
}
