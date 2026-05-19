// remix-store/slices/sync-slice.ts — Server sync slice. Snapshot remix load
// (syncFromServer), store reset (clearAll), realtime event apply
// (applyServerEvent), background_jobs polling fallback (syncJobsFromServer),
// and targeted single-remix refetch on active→terminal job transitions.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { BackgroundJobRow } from '@/types/remix';
import { mapRowToRemix } from '../supabase-mapping';
import { mapRowToJob } from '../map-background-job-row';
import type { RemixSyncSlice, RemixSliceCreator } from '../types';

const log = createLogger('Store', 'RemixStore');

export const createSyncSlice: RemixSliceCreator<RemixSyncSlice> = (
  set,
  get,
) => ({
  syncFromServer: async (snapshotId) => {
    log.info('syncFromServer', 'start', { snapshotId });
    const { data, error } = await supabase
      .from('remixes')
      .select('*')
      .eq('snapshot_id', snapshotId)
      .order('created_at', { ascending: true });

    if (error) {
      log.error('syncFromServer', 'failed', { snapshotId, error: error.message });
      return;
    }

    const remixes = (data ?? []).map(mapRowToRemix);
    log.info('syncFromServer', 'done', { snapshotId, count: remixes.length });
    set({ remixes, activeRemixId: null });
  },

  clearAll: () => {
    log.info('clearAll', 'clearing remix store');
    set({
      remixes: [],
      activeRemixId: null,
      jobs: [],
      entitySwapTasks: {},
    });
  },

  applyServerEvent: (event) => {
    switch (event.type) {
      case 'job_upsert': {
        const incoming = mapRowToJob(event.row);
        // Capture previous job state BEFORE the merge so we can detect
        // active→terminal transitions (which indicate the remix row may
        // have been mutated by the backend and needs refetching).
        const prev = get().jobs.find((j) => j.id === incoming.id) ?? null;
        const wasActive =
          prev === null ||
          prev.status === 'queued' ||
          prev.status === 'running';
        const isTerminal =
          incoming.status === 'completed' ||
          incoming.status === 'failed' ||
          incoming.status === 'cancelled';

        set((s) => {
          const idx = s.jobs.findIndex((j) => j.id === incoming.id);
          if (idx === -1) {
            return { jobs: [...s.jobs, incoming] };
          }
          const next = [...s.jobs];
          next[idx] = { ...next[idx], ...incoming };
          return { jobs: next };
        });
        log.debug('applyServerEvent', 'job_upsert', {
          jobId: incoming.id,
          status: incoming.status,
          phase: incoming.phase,
        });

        // Fire-and-forget remix row refetch on terminal transition.
        // Skip `cancelled` only when backend wrote nothing (we can't
        // tell — refetch anyway for safety; 1 row read is cheap).
        if (wasActive && isTerminal && incoming.remixId) {
          log.info('applyServerEvent', 'transition → refetch remix', {
            remixId: incoming.remixId,
            jobId: incoming.id,
            status: incoming.status,
          });
          void get()
            .refetchRemix(incoming.remixId)
            .catch((err) => {
              log.warn('applyServerEvent', 'refetch failed', {
                remixId: incoming.remixId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
        }
        break;
      }
      case 'job_delete': {
        log.debug('applyServerEvent', 'job_delete', { id: event.id });
        set((s) => ({ jobs: s.jobs.filter((j) => j.id !== event.id) }));
        break;
      }
      default: {
        // Other event types (created/updated/deleted for remixes) not
        // wired in Phase 2 — local CRUD covers those today.
        log.debug('applyServerEvent', 'ignore event type', { type: event.type });
        break;
      }
    }
  },

  refetchRemix: async (remixId) => {
    log.info('refetchRemix', 'fetch', { remixId });
    const { data, error } = await supabase
      .from('remixes')
      .select('*')
      .eq('id', remixId)
      .maybeSingle();

    if (error) {
      log.error('refetchRemix', 'failed', {
        remixId,
        error: error.message,
      });
      return;
    }
    if (!data) {
      log.warn('refetchRemix', 'row not found', { remixId });
      return;
    }

    const remix = mapRowToRemix(data);
    set((s) => {
      const idx = s.remixes.findIndex((r) => r.id === remixId);
      if (idx === -1) {
        // Remix was deleted locally since the job started; ignore.
        return s;
      }
      const next = [...s.remixes];
      next[idx] = remix;
      return { remixes: next };
    });
    log.info('refetchRemix', 'done', { remixId });
  },

  syncJobsFromServer: async (userId) => {
    log.info('syncJobsFromServer', 'fetch', { userId });
    const cutoffIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Two parallel queries instead of `.or(and(...))` — PostgREST nested
    // boolean filters with timestamp values (`:`, `.`) are brittle under
    // URL serialization. KISS: union locally.
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
      log.error('syncJobsFromServer', 'active fetch failed', {
        userId,
        error: activeRes.error.message,
      });
      return;
    }
    if (terminalRes.error) {
      log.error('syncJobsFromServer', 'terminal fetch failed', {
        userId,
        error: terminalRes.error.message,
      });
      return;
    }

    const rows = [
      ...((activeRes.data ?? []) as BackgroundJobRow[]),
      ...((terminalRes.data ?? []) as BackgroundJobRow[]),
    ];
    const jobs = rows.map(mapRowToJob);

    // Detect active→terminal transitions ONLY when we already observed
    // the prior state in this session. Polling fallback (5s tick) is the
    // primary consumer: if a job was 'running' last tick and 'completed'
    // this tick, the remix row likely has fresh audio chunk URLs.
    //
    // Skip prev=null: that's a first-observation (page load / top-up after
    // SUBSCRIBED). On page load, `syncFromServer(snapshotId)` already
    // fetches fresh remixes in parallel — refetching here would be
    // redundant. The realtime branch in `applyServerEvent` covers the
    // first-observation-already-terminal corner case.
    const prevJobsById = new Map(get().jobs.map((j) => [j.id, j]));
    const refetchTargets = new Set<string>();
    for (const incoming of jobs) {
      const prev = prevJobsById.get(incoming.id);
      if (!prev) continue;
      const wasActive = prev.status === 'queued' || prev.status === 'running';
      const isTerminal =
        incoming.status === 'completed' ||
        incoming.status === 'failed' ||
        incoming.status === 'cancelled';
      if (wasActive && isTerminal && incoming.remixId) {
        refetchTargets.add(incoming.remixId);
      }
    }

    log.info('syncJobsFromServer', 'done', {
      userId,
      active: activeRes.data?.length ?? 0,
      terminal: terminalRes.data?.length ?? 0,
      refetchTargets: refetchTargets.size,
    });
    set({ jobs });

    for (const remixId of refetchTargets) {
      void get()
        .refetchRemix(remixId)
        .catch((err) => {
          log.warn('syncJobsFromServer', 'refetch failed', {
            remixId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  },
});
