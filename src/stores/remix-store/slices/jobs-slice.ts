// remix-store/slices/jobs-slice.ts — Remote background_jobs slice. Jobs are
// read-only via realtime + REST enqueue: startAudioJob (POST enqueue +
// optimistic seed row), startMixSwap, cancelJob (optimistic flag), dismissJob.
// Inject (Phase 3 — client-side finalize) lives here too: injectFinalCrops
// resolves is_final winner crops, mutates the illustration blob, and persists
// it in ONE Supabase UPDATE (no background job).

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import { CLIENT_AUDIO_CHUNK_CAP } from '@/types/remix';
import type { InjectResult, RemixIllustration, RemixJob } from '@/types/remix';
import {
  enqueueAudioSwap,
  enqueueRemixMixSwap,
  cancelJobRemote,
  type EnqueueAudioSwapEnqueuedData,
  type EnqueueAudioSwapDedupedData,
} from '@/apis/jobs-api';
import { useAuthStore } from '../../auth-store';
import { pruneSupersededJobs } from '../slice-helpers';
import { resolveFinalCrops } from '../selectors/select-final-crops';
import { applyFinalCrops } from '../apply-final-crops';
import type { RemixJobsSlice, RemixSliceCreator } from '../types';

const log = createLogger('Store', 'RemixStore');

export const createJobsSlice: RemixSliceCreator<RemixJobsSlice> = (
  set,
  get,
) => ({
  jobs: [],

  // ── Audio swap enqueue ─────────────────────────────────────────────
  startAudioJob: async (remixId, opts) => {
    log.info('startAudioJob', 'enqueue', {
      remixId,
      triggeredBy: opts.triggeredBy,
    });

    const params = {
      triggered_by: opts.triggeredBy,
      max_concurrent_chunks_per_textbox:
        opts.maxConcurrentChunksPerTextbox ?? CLIENT_AUDIO_CHUNK_CAP,
    };

    const result = await enqueueAudioSwap(remixId, params);
    if (!result.success) {
      log.error('startAudioJob', 'failed', {
        remixId,
        error: result.error,
        httpStatus: result.httpStatus,
        errorCode: result.errorCode,
      });
      throw new Error(result.error);
    }

    const data = result.data;

    if ('skipped' in data && data.skipped) {
      log.info('startAudioJob', 'skipped', {
        remixId,
        reason: data.reason,
      });
      return { kind: 'skipped', reason: data.reason };
    }

    if ('deduped' in data && data.deduped) {
      const deduped = data as EnqueueAudioSwapDedupedData;
      log.info('startAudioJob', 'deduped', {
        remixId,
        jobId: deduped.job_id,
        status: deduped.status,
      });
      // Ensure job row is present in store; if missing, top-up by re-fetching.
      if (!get().jobs.find((j) => j.id === deduped.job_id)) {
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          void get().syncJobsFromServer(userId).catch(() => undefined);
        }
      }
      return {
        kind: 'deduped',
        jobId: deduped.job_id,
        status: deduped.status,
      };
    }

    const enqueued = data as EnqueueAudioSwapEnqueuedData;
    log.info('startAudioJob', 'enqueued', {
      remixId,
      jobId: enqueued.job_id,
      totalSteps: enqueued.total_steps,
    });

    // Optimistic merge: synthesize partial RemixJob row so badge appears
    // immediately. Realtime UPDATE fills current_step/step_details next.
    const nowIso = new Date().toISOString();
    const seed: RemixJob = {
      id: enqueued.job_id,
      remixId,
      phase: 'audio',
      triggeredBy: opts.triggeredBy,
      status: 'queued',
      currentStep: 0,
      totalSteps: enqueued.total_steps,
      stepDetails: undefined,
      result: undefined,
      cancelRequested: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: undefined,
    };
    set((s) => {
      if (s.jobs.find((j) => j.id === seed.id)) return s;
      // Prune so a stale failed sibling of the same lineage clears the moment a
      // fresh attempt is seeded (no resurrection after the new job dismisses).
      return { jobs: pruneSupersededJobs([...s.jobs, seed]) };
    });

    return {
      kind: 'enqueued',
      jobId: enqueued.job_id,
      totalSteps: enqueued.total_steps,
      chunksToRegen: enqueued.chunks_to_regen,
      textboxesToRecombine: enqueued.textboxes_to_recombine,
    };
  },

  // ── Inject (Phase 3 — client-side finalize) ────────────────────────
  // Synchronous finalize (NO background job): resolve the is_final winner
  // crops, mutate the illustration blob (pure helper), optimistically set
  // local state, then persist the full `illustration` column in ONE Supabase
  // UPDATE. Rollback via refetchRemix on persist failure. Pure: returns
  // InjectResult or throws — the UI handler owns the toast.
  injectFinalCrops: async (remixId): Promise<InjectResult> => {
    log.info('injectFinalCrops', 'inject requested', { remixId });

    const remix = get().remixes.find((r) => r.id === remixId);
    if (!remix) {
      log.warn('injectFinalCrops', 'remix not found', { remixId });
      throw new Error('REMIX_NOT_FOUND');
    }

    const finals = resolveFinalCrops(remix);
    if (finals.length === 0) {
      log.warn('injectFinalCrops', 'no final crops to inject', { remixId });
      throw new Error('no final crops to inject');
    }

    const nowISO = new Date().toISOString();
    const { spreads, appliedCount, collapsedCount, spreadCount } =
      applyFinalCrops(remix.illustration, finals, nowISO);

    const nextIllustration: RemixIllustration = {
      ...remix.illustration,
      spreads,
    };

    // Optimistic local update (same body as the persisted UPDATE).
    set((s) => ({
      remixes: s.remixes.map((r) =>
        r.id === remixId ? { ...r, illustration: nextIllustration } : r,
      ),
    }));

    const { error } = await supabase
      .from('remixes')
      .update({ illustration: nextIllustration })
      .eq('id', remixId);

    if (error) {
      log.error('injectFinalCrops', 'persist failed; rolling back', {
        remixId,
        error: error.message,
      });
      // Rollback to authoritative server row, then surface the error.
      await get().refetchRemix(remixId);
      throw new Error(error.message);
    }

    log.info('injectFinalCrops', 'inject complete', {
      remixId,
      appliedCount,
      collapsedCount,
      spreadCount,
    });
    return { appliedCount, collapsedCount, spreadCount };
  },

  // ── Batch (mix) crop-sheet swap enqueue (api/jobs/05) ──────────────
  // Mirrors startAudioJob: POST enqueue + optimistic seed `remix_mix_swap`
  // row. Cross-type dedup (backend allows 1 swap/remix); an already-running
  // mix swap no-ops. `params` (swap model) is v1 collect-only — NOT sent in body.
  startMixSwap: async (params) => {
    const { remixId, batchId, forceResweep = true } = params;

    const alreadyRunning = get().jobs.some(
      (j) =>
        j.phase === 'remix_mix_swap' &&
        j.remixId === remixId &&
        j.batchId === batchId &&
        (j.status === 'queued' || j.status === 'running'),
    );
    if (alreadyRunning) {
      log.debug('startMixSwap', 'swap already running — no-op', {
        remixId,
        batchId,
      });
      return { kind: 'skipped', reason: 'busy' };
    }

    log.info('startMixSwap', 'enqueue', { remixId, batchId, forceResweep });
    // Throws EnqueueJobError on non-2xx (incl. 422 MISSING_VARIANT_REFERENCE /
    // TOO_MANY_SWAP_TARGETS / NO_SWAP_TARGETS) — caller (modal) toasts on `code`.
    const data = await enqueueRemixMixSwap(remixId, {
      batch_id: batchId,
      force_resweep: forceResweep,
    });

    if ('skipped' in data && data.skipped) {
      log.info('startMixSwap', 'skipped', { remixId, reason: data.reason });
      return { kind: 'skipped', reason: data.reason };
    }

    if ('deduped' in data && data.deduped) {
      log.info('startMixSwap', 'deduped', {
        remixId,
        jobId: data.job_id,
        status: data.status,
      });
      // Active job may be a char-swap (cross-type dedup). Top-up jobs[] if the
      // row isn't mirrored locally yet.
      if (!get().jobs.find((j) => j.id === data.job_id)) {
        const userId = useAuthStore.getState().user?.id;
        if (userId) {
          void get().syncJobsFromServer(userId).catch(() => undefined);
        }
      }
      return {
        kind: 'deduped',
        jobId: data.job_id,
        status: data.status,
      };
    }

    log.info('startMixSwap', 'enqueued', {
      remixId,
      batchId,
      jobId: data.job_id,
      totalSteps: data.total_steps,
    });

    // Optimistic seed — overlay appears immediately; realtime fills
    // current_step/result next. Merge by id so realtime doesn't duplicate.
    const nowIso = new Date().toISOString();
    const seed: RemixJob = {
      id: data.job_id,
      remixId,
      phase: 'remix_mix_swap',
      batchId,
      triggeredBy: 'user',
      status: 'queued',
      currentStep: 0,
      totalSteps: data.total_steps,
      stepDetails: undefined,
      result: undefined,
      cancelRequested: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: undefined,
    };
    set((s) => {
      if (s.jobs.find((j) => j.id === seed.id)) return s;
      return { jobs: pruneSupersededJobs([...s.jobs, seed]) };
    });

    return {
      kind: 'enqueued',
      jobId: data.job_id,
      totalSteps: data.total_steps,
    };
  },

  cancelJob: async (jobId) => {
    log.info('cancelJob', 'request', { jobId });
    // Optimistic flip cancelRequested=true. Authoritative cancelled status
    // arrives via realtime UPDATE.
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, cancelRequested: true } : j,
      ),
    }));

    const result = await cancelJobRemote(jobId);
    if (!result.success) {
      log.error('cancelJob', 'failed', {
        jobId,
        error: result.error,
        httpStatus: result.httpStatus,
      });
      // Rollback optimistic flag so user can retry.
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === jobId ? { ...j, cancelRequested: false } : j,
        ),
      }));
      throw new Error(result.error);
    }

    log.debug('cancelJob', 'flag set', {
      jobId,
      status: result.data.current_status,
    });
  },

  dismissJob: (jobId) => {
    log.debug('dismissJob', 'remove from store', { jobId });
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== jobId) }));
  },
});
