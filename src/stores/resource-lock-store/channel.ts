// resource-lock-store/channel.ts — Single Supabase Realtime channel for the
// `resource_locks` rows of one book. Mirrors background-jobs-store/channel.ts:
// the channel ref is assigned SYNCHRONOUSLY right after the fire-and-forget
// `ensureRealtimeAuth()` so `teardown()` always has a ref even mid-subscribe
// (await-before-channel would leave cleanup with null → leaked duplicate-topic
// channel — memory reference_supabase_realtime_sync_channel). Down → exp-backoff
// reheal; on (re)subscribe the store re-seeds the registry to top-up missed events.

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/apis/supabase';
import { ensureRealtimeAuth } from '@/apis/supabase-realtime';
import { createLogger } from '@/utils/logger';
import type { ResourceLockRawRow } from './types';

const log = createLogger('Store', 'ResourceLocksChannel');

const REHEAL_BASE_MS = 1000;
const REHEAL_MAX_MS = 15_000;

export interface ResourceLocksChannelArgs {
  bookId: string;
  onUpsert: (row: ResourceLockRawRow) => void; // INSERT / UPDATE
  onDelete: (row: ResourceLockRawRow) => void; // DELETE (full old row via REPLICA IDENTITY FULL)
  onLive: () => void; // SUBSCRIBED
  onDown: () => void; // CHANNEL_ERROR / TIMED_OUT / CLOSED
  onReseed: () => void; // (re)subscribe → re-seed registry (top-up gap)
}

export interface ChannelHandle {
  teardown: () => void;
}

/** Open the single per-book resource_locks channel with exp-backoff reheal.
 *  Returns a `teardown()` safe to call at any time (including mid-subscribe). */
export function openResourceLocksChannel(args: ResourceLocksChannelArgs): ChannelHandle {
  const { bookId, onUpsert, onDelete, onLive, onDown, onReseed } = args;

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
    // carries auth — avoids first-join TIMED_OUT / silent RLS drop.
    void ensureRealtimeAuth();

    log.info('subscribe', 'open resource-locks channel', { bookId, attempt: rehealAttempts });
    channel = supabase
      .channel(`resource_locks:${bookId}`)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table: 'resource_locks',
          filter: `book_id=eq.${bookId}`,
        },
        (payload: {
          eventType?: 'INSERT' | 'UPDATE' | 'DELETE';
          new?: ResourceLockRawRow;
          old?: ResourceLockRawRow;
        }) => {
          if (cancelled) return;
          if (payload.eventType === 'DELETE') {
            const row = payload.old;
            if (row?.resource_id) onDelete(row);
            return;
          }
          const row = payload.new;
          if (row?.resource_id) onUpsert(row);
        },
      )
      .subscribe((status, err) => {
        if (cancelled) return;
        log.debug('subscribe', 'status', { bookId, status, err: err?.message ?? null });
        if (status === 'SUBSCRIBED') {
          rehealAttempts = 0;
          onLive();
          // Missed events while down are not replayed → re-seed the registry.
          try {
            onReseed();
          } catch (e) {
            log.error('subscribe', 'reseed on subscribe failed', {
              error: e instanceof Error ? e.message : String(e),
            });
          }
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
      log.info('teardown', 'close resource-locks channel', { bookId });
      if (rehealTimer) clearTimeout(rehealTimer);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    },
  };
}

/** Seed: fetch the current live locks for a book (top-up missed events at mount /
 *  resubscribe). Errors → empty array (registry stays as-is). */
export async function fetchResourceLocks(bookId: string): Promise<ResourceLockRawRow[]> {
  const { data, error } = await supabase
    .from('resource_locks')
    .select('book_id, step, resource_type, resource_id, locale, holder_user_id, acquired_at, expires_at')
    .eq('book_id', bookId);
  if (error) {
    log.warn('fetchResourceLocks', 'seed select failed', { bookId, error: error.message });
    return [];
  }
  return (data ?? []) as ResourceLockRawRow[];
}
