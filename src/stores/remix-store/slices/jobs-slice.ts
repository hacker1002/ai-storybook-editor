// remix-store/slices/jobs-slice.ts — Remote background_jobs slice. Jobs are
// read-only via realtime + REST enqueue: startAudioJob / startImageJob (POST
// enqueue + optimistic seed row), cancelJob (optimistic flag), dismissJob.

import { createLogger } from '@/utils/logger';
import { CLIENT_AUDIO_CHUNK_CAP } from '@/types/remix';
import type { RemixJob } from '@/types/remix';
import {
  enqueueAudioSwap,
  enqueueImageSwap,
  enqueueCharacterSwap,
  cancelJobRemote,
  type EnqueueAudioSwapData,
  type EnqueueAudioSwapEnqueuedData,
  type EnqueueAudioSwapDedupedData,
} from '@/apis/jobs-api';
import { useAuthStore } from '../../auth-store';
import { pruneSupersededJobs } from '../slice-helpers';
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

  // ── Image swap enqueue (Phase 3 ready — UI gated, endpoint live) ──
  startImageJob: async (remixId) => {
    log.info('startImageJob', 'enqueue', { remixId });
    const result = await enqueueImageSwap(remixId);
    if (!result.success) {
      log.error('startImageJob', 'failed', {
        remixId,
        error: result.error,
        httpStatus: result.httpStatus,
      });
      throw new Error(result.error);
    }

    const data: EnqueueAudioSwapData = result.data;

    if ('skipped' in data && data.skipped) {
      return { kind: 'skipped', reason: data.reason };
    }
    if ('deduped' in data && data.deduped) {
      const deduped = data as EnqueueAudioSwapDedupedData;
      return {
        kind: 'deduped',
        jobId: deduped.job_id,
        status: deduped.status,
      };
    }

    const enqueued = data as EnqueueAudioSwapEnqueuedData;
    const nowIso = new Date().toISOString();
    const seed: RemixJob = {
      id: enqueued.job_id,
      remixId,
      phase: 'image',
      triggeredBy: 'user',
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

  // ── Character crop-sheet swap enqueue (api/jobs/04) ────────────────
  // Mirrors startAudioJob/startImageJob: POST enqueue + optimistic seed row.
  // The swap LOOP runs backend (per-sheet Gemini); the client only enqueues and
  // reflects realtime job_upsert into jobs[]. Co-located here (not swap-slice)
  // per Validation S1.
  startEntitySwap: async (params) => {
    const { remixId, type, key, forceResweep = false } = params;

    // Defensive guards (button is also disabled in the UI):
    //  - prop/mix have no character-swap job (char-only v1).
    //  - dedup: backend allows strictly 1 char-swap / remix.
    if (type !== 'character') {
      log.debug('startEntitySwap', 'unsupported type — no-op', { type, key });
      return { kind: 'skipped', reason: 'unsupported_type' };
    }
    const alreadyRunning = get().jobs.some(
      (j) =>
        j.phase === 'character_swap' &&
        j.remixId === remixId &&
        (j.status === 'queued' || j.status === 'running'),
    );
    if (alreadyRunning) {
      log.debug('startEntitySwap', 'swap already running — no-op', {
        remixId,
        key,
      });
      return { kind: 'skipped', reason: 'busy' };
    }

    log.info('startEntitySwap', 'enqueue', { remixId, key, forceResweep });
    // Throws EnqueueJobError on non-2xx (incl. 422 MISSING_VARIANT_REFERENCE) —
    // caller (modal) toasts based on `code`.
    const data = await enqueueCharacterSwap(remixId, {
      character_key: key,
      force_resweep: forceResweep,
    });

    if ('skipped' in data && data.skipped) {
      log.info('startEntitySwap', 'skipped', { remixId, reason: data.reason });
      return { kind: 'skipped', reason: data.reason };
    }

    if ('deduped' in data && data.deduped) {
      log.info('startEntitySwap', 'deduped', {
        remixId,
        jobId: data.job_id,
        status: data.status,
      });
      // The active job's character_key may differ from the requested key.
      // Top-up jobs[] if the row isn't mirrored locally yet.
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
        characterKey: data.character_key,
      };
    }

    log.info('startEntitySwap', 'enqueued', {
      remixId,
      jobId: data.job_id,
      totalSteps: data.total_steps,
      characterKey: data.character_key,
    });

    // Optimistic seed — badge/overlay appears immediately; realtime fills
    // current_step/result next. Merge by id so realtime doesn't duplicate.
    const nowIso = new Date().toISOString();
    const seed: RemixJob = {
      id: data.job_id,
      remixId,
      phase: 'character_swap',
      characterKey: data.character_key,
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
      // Prune so a stale failed sibling of the same lineage clears the moment a
      // fresh attempt is seeded (no resurrection after the new job dismisses).
      return { jobs: pruneSupersededJobs([...s.jobs, seed]) };
    });

    return {
      kind: 'enqueued',
      jobId: data.job_id,
      totalSteps: data.total_steps,
      characterKey: data.character_key,
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
