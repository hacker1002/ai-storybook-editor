// remix-store/slices/sync-slice.ts — Server sync slice. Snapshot remix load
// (syncFromServer), store reset (clearAll), realtime event apply
// (applyServerEvent), background_jobs polling fallback (syncJobsFromServer),
// and targeted single-remix refetch on active→terminal job transitions.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import { newUuid } from '@/utils/uuid';
import type { BackgroundJobRow, Remix, RemixMix } from '@/types/remix';
import {
  DIMENSION_CANVAS_SIZE,
  DEFAULT_CANVAS_SIZE,
} from '@/constants/canvas-dimension-constants';
import { computeCropSheetLayout } from '@/utils/crop-sheet-layout-engine';
import { groupCropsForBatch } from '@/utils/crop-grouping';
import { buildSheetsFromLayout } from '../crop-sheet-layout';
import { mapRowToRemix } from '../supabase-mapping';
import { mapRowToJob } from '../map-background-job-row';
import {
  needsMigration as needsFinalFlagMigration,
  reconcileOrphanFinals,
} from '../selectors/select-final-crops';
import { pruneSupersededJobs } from '../slice-helpers';
import { useBookStore } from '../../book-store';
import type { RemixSyncSlice, RemixSliceCreator } from '../types';

const log = createLogger('Store', 'RemixStore');

/** Detect a remix still on the legacy (pre-batch) shape. Idempotent guard for
 *  `migrateLegacyRemixToBatch` — true when there's no batch, a batch is missing
 *  its uuid `id`, a batch still carries the legacy `keys[]` lineup, or crops are
 *  still attached to entity `crop_sheets[]`. */
function needsBatchMigration(remix: Remix): boolean {
  if (remix.mixes.length === 0) return true;
  if (
    remix.mixes.some(
      (m) => m.id == null || (m as { keys?: unknown }).keys != null,
    )
  ) {
    return true;
  }
  const hasEntityCrops = [...remix.characters, ...remix.props].some((e) =>
    (e.crop_sheets ?? []).some((s) => (s.crops ?? []).length > 0),
  );
  return hasEntityCrops;
}

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

    // R3 / migration — one-shot fixup for remixes whose mixes blob predates
    // the `is_final` flag (Validation Session 1: case "created" semantic on
    // initial load, NEVER on realtime "updated"). `reconcileOrphanFinals` is
    // idempotent (`changed=false` short-circuits before persist) so this is
    // safe to call across every load — work only happens once per remix.
    for (const remix of remixes) {
      if (!needsFinalFlagMigration(remix.mixes)) continue;
      const result = reconcileOrphanFinals(remix.mixes);
      if (!result.changed) continue;
      log.info('syncFromServer', 'is_final migration applied', {
        remixId: remix.id,
        claimed: result.log.claimed,
        defensiveCleared: result.log.defensiveCleared,
        dropped: result.log.dropped,
      });
      set((s) => ({
        remixes: s.remixes.map((r) =>
          r.id === remix.id ? { ...r, mixes: result.mixes } : r,
        ),
      }));
      const { error } = await supabase
        .from('remixes')
        .update({ mixes: result.mixes })
        .eq('id', remix.id);
      if (error) {
        log.error('syncFromServer', 'is_final migration persist failed', {
          remixId: remix.id,
          error: error.message,
        });
        // Roll the migrated remix back to the loaded-from-server shape — the
        // UI will fall back to `resolveFinalCrops` defensive winner pick.
        set((s) => ({
          remixes: s.remixes.map((r) =>
            r.id === remix.id ? { ...r, mixes: remix.mixes } : r,
          ),
        }));
      }
    }
  },

  clearAll: () => {
    log.info('clearAll', 'clearing remix store');
    set({
      remixes: [],
      activeRemixId: null,
      jobs: [],
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
            return { jobs: pruneSupersededJobs([...s.jobs, incoming]) };
          }
          const next = [...s.jobs];
          next[idx] = { ...next[idx], ...incoming };
          return { jobs: pruneSupersededJobs(next) };
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
    set({ jobs: pruneSupersededJobs(jobs) });

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

  migrateLegacyRemixToBatch: async (remixId) => {
    const prevRemix = get().remixes.find((r) => r.id === remixId);
    if (!prevRemix) {
      log.warn('migrateLegacyRemixToBatch', 'remix not found — skip', {
        remixId,
      });
      return false;
    }
    if (!needsBatchMigration(prevRemix)) {
      log.debug('migrateLegacyRemixToBatch', 'no migration needed', { remixId });
      return false;
    }

    log.info('migrateLegacyRemixToBatch', 'start', {
      remixId,
      mixCount: prevRemix.mixes.length,
    });

    // Rebuild crops from the frozen illustration tags (single source of truth) —
    // NOT from legacy entity/mix crops (no longer type-valid post-reshape).
    const dimension = useBookStore.getState().currentBook?.dimension ?? null;
    const spread =
      dimension == null
        ? DEFAULT_CANVAS_SIZE
        : DIMENSION_CANVAS_SIZE[dimension] ?? DEFAULT_CANVAS_SIZE;
    const { cropInputs, cropMetaById } = groupCropsForBatch(prevRemix);
    const layout = computeCropSheetLayout(cropInputs, { sheetCount: 1, spread });

    // Preserve an existing valid batch id (idempotent re-shape); else a new uuid.
    const existingId = prevRemix.mixes.find((m) => typeof m.id === 'string')?.id;
    const batch: RemixMix = {
      id: existingId ?? newUuid(),
      order: 0,
      name: 'Batch 1',
      crop_sheets: buildSheetsFromLayout(layout, cropMetaById),
    };

    // Optimistic: single batch + cleared entity crop_sheets.
    set((s) => ({
      remixes: s.remixes.map((r) =>
        r.id === remixId
          ? {
              ...r,
              mixes: [batch],
              characters: r.characters.map((c) => ({ ...c, crop_sheets: [] })),
              props: r.props.map((p) => ({ ...p, crop_sheets: [] })),
            }
          : r,
      ),
    }));

    const remixAfter = get().remixes.find((r) => r.id === remixId);
    if (!remixAfter) {
      log.warn('migrateLegacyRemixToBatch', 'remix gone before persist — skip', {
        remixId,
      });
      return false;
    }

    const { error } = await supabase
      .from('remixes')
      .update({
        mixes: remixAfter.mixes,
        characters: remixAfter.characters,
        props: remixAfter.props,
      })
      .eq('id', remixId);

    if (error) {
      log.error('migrateLegacyRemixToBatch', 'persist failed — rollback', {
        remixId,
        error: error.message,
      });
      set((s) => ({
        remixes: s.remixes.map((r) => (r.id === remixId ? prevRemix : r)),
      }));
      return false;
    }

    log.info('migrateLegacyRemixToBatch', 'done', {
      remixId,
      batchId: batch.id,
      sheetCount: batch.crop_sheets.length,
    });
    return true;
  },
});
