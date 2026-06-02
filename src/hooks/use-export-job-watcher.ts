// use-export-job-watcher.ts — Standalone Supabase realtime watcher for
// `export_pdf` background jobs (book + remix). Independent of RemixStore's
// background_jobs subscription (Validation S1 decision — no coupling, active
// even when no remix exists). Mounted by the Distribution section root.
//
// On a watched job transitioning to `running` (first time) → refetch the source
// distribution so the EXPORTING badge appears; on terminal (completed/failed/
// cancelled) → refetch again to pull the job handler's updated/failed/outdated
// leaf. No polling — backend reaper guards permanent stuck (spec 06 finalize).

import * as React from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/apis/supabase';
import { useAuthStore } from '@/stores/auth-store';
import { useBookActions } from '@/stores/book-store';
import { useRemixActions } from '@/stores/remix-store';
import type { BackgroundJobRow } from '@/types/remix';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'ExportJobWatcher');

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

interface ExportJobWatcherArgs {
  bookId: string | null;
  remixIds: string[];
}

/** Subscribe to `background_jobs` (type=export_pdf) for the current user; refetch
 *  the affected source's distribution on running/terminal transitions. */
export function useExportJobWatcher({ bookId, remixIds }: ExportJobWatcherArgs): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { refetchBookDistribution } = useBookActions();
  const { refetchRemix } = useRemixActions();

  // Keep latest target ids + actions in refs so the channel effect only
  // re-subscribes on userId change (not on every remix-list / action ref churn).
  // Assign in an effect (NOT render body) — repo lints ref writes in render.
  const bookIdRef = React.useRef(bookId);
  const remixIdsRef = React.useRef(remixIds);
  const refetchBookRef = React.useRef(refetchBookDistribution);
  const refetchRemixRef = React.useRef(refetchRemix);
  React.useEffect(() => {
    bookIdRef.current = bookId;
    remixIdsRef.current = remixIds;
    refetchBookRef.current = refetchBookDistribution;
    refetchRemixRef.current = refetchRemix;
  });

  React.useEffect(() => {
    if (!userId) {
      log.debug('subscribe', 'no user — skip');
      return;
    }

    log.info('subscribe', 'open export_pdf watcher', { userId });
    const seenRunning = new Set<string>();

    const handle = (row: BackgroundJobRow) => {
      if (row.type !== 'export_pdf') return;
      if (!row.params || typeof row.params !== 'object') return; // malformed row guard
      const params = row.params as {
        source?: 'book' | 'remix';
        book_id?: string;
        remix_id?: string;
      };
      const source = params.source ?? (params.remix_id ? 'remix' : 'book');
      const isRunning = row.status === 'running';
      const isTerminal = TERMINAL.has(row.status);

      // First running event → show EXPORTING; terminal → pull final leaf. Skip
      // repeated running step-updates (only the first per job triggers refetch).
      if (isRunning) {
        if (seenRunning.has(row.id)) return;
        seenRunning.add(row.id);
      } else if (!isTerminal) {
        return; // queued — leaf not written yet
      }

      if (source === 'remix') {
        const remixId = params.remix_id;
        if (!remixId || !remixIdsRef.current.includes(remixId)) return;
        log.info('handle', 'refetch remix distribution', {
          remixId,
          jobId: row.id,
          status: row.status,
        });
        void refetchRemixRef.current(remixId);
      } else {
        const targetBook = bookIdRef.current;
        if (!targetBook || (params.book_id && params.book_id !== targetBook)) return;
        log.info('handle', 'refetch book distribution', {
          bookId: targetBook,
          jobId: row.id,
          status: row.status,
        });
        void refetchBookRef.current(targetBook);
      }
    };

    // Self-healing subscribe loop. Realtime can drop the channel on auth-token
    // rotation, network blip, or server-side timeout WITHOUT the React effect
    // tearing down. The status callback is our only hook into that path; on
    // terminal statuses we rebuild as long as the effect owner hasn't been
    // cancelled. Auth is set BEFORE channel.subscribe() to avoid first-attempt
    // TIMED_OUT (JOIN message races setAuth on the connection).
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let rehealTimer: ReturnType<typeof setTimeout> | null = null;
    let rehealAttempts = 0;
    const REHEAL_BASE_MS = 1000;
    const REHEAL_MAX_MS = 15_000;

    const subscribe = async () => {
      if (cancelled) return;
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        const token = data.session?.access_token;
        if (token) supabase.realtime.setAuth(token);
      } catch (err) {
        log.warn('subscribe', 'realtime auth set failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (cancelled) return;

      log.info('subscribe', 'open export_pdf watcher', { userId, attempt: rehealAttempts });
      channel = supabase
        .channel(`export-jobs-${userId}`)
        .on(
          'postgres_changes' as never,
          {
            event: '*',
            schema: 'public',
            table: 'background_jobs',
            filter: `user_id=eq.${userId}`,
          },
          (payload: { new?: BackgroundJobRow }) => {
            if (cancelled) return;
            const row = payload.new;
            if (row) handle(row);
          },
        )
        .subscribe((status, err) => {
          log.debug('subscribe', 'status', {
            userId,
            status,
            err: err?.message ?? null,
          });
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            rehealAttempts = 0;
            return;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            const dead = channel;
            channel = null;
            if (dead) void supabase.removeChannel(dead);
            if (rehealTimer) clearTimeout(rehealTimer);
            rehealAttempts += 1;
            const delay = Math.min(REHEAL_BASE_MS * 2 ** (rehealAttempts - 1), REHEAL_MAX_MS);
            log.warn('subscribe', 'channel down, rehealing', {
              userId,
              status,
              attempt: rehealAttempts,
              delayMs: delay,
            });
            rehealTimer = setTimeout(() => void subscribe(), delay);
          }
        });
    };

    void subscribe();

    return () => {
      cancelled = true;
      log.info('subscribe', 'close export_pdf watcher', { userId });
      if (rehealTimer) clearTimeout(rehealTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);
}
