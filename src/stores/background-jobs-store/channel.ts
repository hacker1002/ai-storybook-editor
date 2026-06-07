// background-jobs-store/channel.ts — Single Supabase Realtime channel for the
// user's `background_jobs` rows. Domain-agnostic (no remix/book import). Merges
// the two legacy reconnection strategies (ADR-037):
//   - reheal: exp-backoff channel rebuild (export-watcher behaviour)
//   - poll:   5s top-up while down (RemixStore behaviour)
// Down → reheal AND poll so a stuck channel never silently drops events; up →
// stop poll + top-up the gap.
//
// Channel ref is assigned SYNCHRONOUSLY right after the fire-and-forget
// `ensureRealtimeAuth()` so `teardown()` always has a ref even if init is still
// mid-flight (await-before-channel would leave cleanup with null → leaked
// duplicate-topic channel — memory reference_supabase_realtime_sync_channel).

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/apis/supabase';
import { ensureRealtimeAuth } from '@/apis/supabase-realtime';
import { createLogger } from '@/utils/logger';
import type { BackgroundJobRawRow } from './types';

const log = createLogger('Store', 'BackgroundJobsChannel');

const POLL_INTERVAL_MS = 5000;
const REHEAL_BASE_MS = 1000;
const REHEAL_MAX_MS = 15_000;

export interface OpenChannelArgs {
  userId: string;
  onRow: (row: BackgroundJobRawRow) => void;
  onDelete: (id: string) => void;
  onLive: () => void; // SUBSCRIBED → isChannelLive=true
  onDown: () => void; // CHANNEL_ERROR/TIMED_OUT/CLOSED → isChannelLive=false
  onPoll: () => void; // top-up sync (on SUBSCRIBED + every poll tick)
}

export interface ChannelHandle {
  teardown: () => void;
}

/** Open the single per-user background_jobs channel with merged reheal+poll
 *  recovery. Returns a `teardown()` that is safe to call at any time (including
 *  while the first subscribe is still pending). */
export function openBackgroundJobsChannel(args: OpenChannelArgs): ChannelHandle {
  const { userId, onRow, onDelete, onLive, onDown, onPoll } = args;

  let cancelled = false;
  let channel: RealtimeChannel | null = null;
  let pollId: ReturnType<typeof setInterval> | null = null;
  let rehealTimer: ReturnType<typeof setTimeout> | null = null;
  let rehealAttempts = 0;

  const startPoll = () => {
    if (pollId !== null) return;
    log.warn('startPoll', 'channel down — polling fallback', { userId, intervalMs: POLL_INTERVAL_MS });
    pollId = setInterval(() => {
      try {
        onPoll();
      } catch (err) {
        log.error('startPoll', 'poll tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, POLL_INTERVAL_MS);
  };

  const stopPoll = () => {
    if (pollId === null) return;
    clearInterval(pollId);
    pollId = null;
  };

  const scheduleReheal = () => {
    const dead = channel;
    channel = null;
    if (dead) void supabase.removeChannel(dead);
    if (rehealTimer) clearTimeout(rehealTimer);
    rehealAttempts += 1;
    const delay = Math.min(REHEAL_BASE_MS * 2 ** (rehealAttempts - 1), REHEAL_MAX_MS);
    log.warn('scheduleReheal', 'channel down, rehealing', { userId, attempt: rehealAttempts, delayMs: delay });
    rehealTimer = setTimeout(() => subscribe(), delay);
  };

  const subscribe = () => {
    if (cancelled) return;
    // Fire-and-forget JWT push BEFORE the (sync) .subscribe() so the JOIN frame
    // carries auth — avoids first-join TIMED_OUT / silent RLS drop.
    void ensureRealtimeAuth();

    log.info('subscribe', 'open background-jobs channel', { userId, attempt: rehealAttempts });
    channel = supabase
      .channel(`background-jobs-${userId}`)
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
          new?: BackgroundJobRawRow;
          old?: { id?: string };
        }) => {
          if (cancelled) return;
          if (payload.eventType === 'DELETE') {
            const id = payload.old?.id;
            if (id) onDelete(id);
            return;
          }
          const row = payload.new;
          if (row) onRow(row);
        },
      )
      .subscribe((status, err) => {
        if (cancelled) return;
        log.debug('subscribe', 'status', { userId, status, err: err?.message ?? null });
        if (status === 'SUBSCRIBED') {
          rehealAttempts = 0;
          onLive();
          stopPoll();
          // Missed events while down are not replayed → top-up the gap.
          try {
            onPoll();
          } catch (e) {
            log.error('subscribe', 'top-up on subscribe failed', {
              error: e instanceof Error ? e.message : String(e),
            });
          }
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          onDown();
          startPoll();
          scheduleReheal();
        }
      });
  };

  subscribe();

  return {
    teardown: () => {
      cancelled = true;
      log.info('teardown', 'close background-jobs channel', { userId });
      stopPoll();
      if (rehealTimer) clearTimeout(rehealTimer);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    },
  };
}
