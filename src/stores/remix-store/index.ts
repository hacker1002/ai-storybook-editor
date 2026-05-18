// remix-store/index.ts — Standalone Zustand store managing remix rows + remote
// background_jobs (audio/image swap). Frontend owns remix CRUD via supabase-js
// (RLS-protected); jobs are read-only via realtime channel + REST enqueue.

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type {
  BackgroundJobRow,
  CLIENT_AUDIO_CHUNK_CAP as CapType,
  CropSheetSwapTaskKey,
  EnqueueRemixJobOutcome,
  Remix,
  RemixConfig,
  RemixCropSheet,
  RemixEntityRef,
  RemixJob,
  RemixServerEvent,
  RemixSpread,
  StartCropSheetSwapParams,
  SwapTaskStatus,
} from '@/types/remix';
import { CLIENT_AUDIO_CHUNK_CAP, canonicalMixKey } from '@/types/remix';
import type { Human } from '@/types/human';
import { buildRemixClonePayload } from './clone-builder';
import { mapRowToRemix } from './supabase-mapping';
import { mapRowToJob } from './map-background-job-row';
import {
  subscribeBackgroundJobs,
  unsubscribeBackgroundJobs,
} from './realtime';
import { useSnapshotStore } from '../snapshot-store';
import { useHumansStore } from '../humans-store';
import { useAuthStore } from '../auth-store';
import { applyTextSwap } from '@/features/remix/text-swap-engine';
import {
  enqueueAudioSwap,
  enqueueImageSwap,
  cancelJobRemote,
  type EnqueueAudioSwapData,
  type EnqueueAudioSwapEnqueuedData,
  type EnqueueAudioSwapDedupedData,
} from '@/apis/jobs-api';

const log = createLogger('Store', 'RemixStore');

// Re-export so callers don't need a separate import for the cap constant.
export { CLIENT_AUDIO_CHUNK_CAP };
export type { CapType };

// ── Patch shape exposed by job/runner helpers ────────────────────────────────

export interface RemixCropSheetPatch {
  type: 'character' | 'prop' | 'mix';
  key: string;
  /** Index into entity.crop_sheets[]. */
  sheetIndex: number;
  patch: Partial<RemixCropSheet>;
}

// ── Crop sheet swap task helpers ─────────────────────────────────────────────

/** Composes the `cropSheetSwapTasks` map key. Shared between action + selector
 *  so the format never drifts. */
function buildSwapTaskKey(
  remixId: string,
  type: 'character' | 'prop' | 'mix',
  key: string,
  sheetIndex: number,
): CropSheetSwapTaskKey {
  return `${remixId}:${type}:${key}:${sheetIndex}`;
}

/** Stable reference for the default idle task — avoids a fresh object per
 *  `useCropSheetSwapTask` call (would defeat selector re-render guards). */
const IDLE_SWAP_TASK: SwapTaskStatus = { state: 'idle' };

// ── Store shape ──────────────────────────────────────────────────────────────

interface StartAudioJobOptions {
  triggeredBy: 'auto-create' | 'user';
  /** Override default CLIENT_AUDIO_CHUNK_CAP. Backend may clamp further. */
  maxConcurrentChunksPerTextbox?: number;
}

interface RemixStore {
  remixes: Remix[];
  activeRemixId: string | null;
  jobs: RemixJob[];
  /** Ephemeral per-sheet swap task map (memory-only — not persisted, no
   *  background_jobs row). Mirrors ImageTaskSlice but flat. */
  cropSheetSwapTasks: Record<CropSheetSwapTaskKey, SwapTaskStatus>;

  syncFromServer: (snapshotId: string) => Promise<void>;
  clearAll: () => void;

  createRemix: (config: RemixConfig, name?: string) => Promise<Remix | null>;
  updateRemixConfig: (id: string, patch: RemixConfig) => Promise<boolean>;
  renameRemix: (id: string, name: string) => Promise<boolean>;
  deleteRemix: (id: string) => Promise<boolean>;
  setActiveRemixId: (id: string | null) => void;

  startAudioJob: (
    remixId: string,
    opts: StartAudioJobOptions,
  ) => Promise<EnqueueRemixJobOutcome>;
  startImageJob: (remixId: string) => Promise<EnqueueRemixJobOutcome>;
  cancelJob: (jobId: string) => Promise<void>;
  dismissJob: (jobId: string) => void;

  applyServerEvent: (event: RemixServerEvent) => void;
  syncJobsFromServer: (userId: string) => Promise<void>;
  /** Targeted single-remix refetch. Triggered when a background job for
   *  that remix transitions to a terminal status — DB row may have new
   *  illustration/audio chunk URLs the local copy doesn't reflect. */
  refetchRemix: (remixId: string) => Promise<void>;

  patchRemixIllustration: (id: string, spreads: RemixSpread[]) => void;
  patchRemixCropSheets: (id: string, updates: RemixCropSheetPatch[]) => void;

  /** Modal-driven per-sheet swap trigger. DEFERRED no-op — guard + validate +
   *  log are real; the POST branch lands when the swap API ships. */
  startCropSheetSwap: (params: StartCropSheetSwapParams) => Promise<void>;
}

export const useRemixStore = create<RemixStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      remixes: [],
      activeRemixId: null,
      jobs: [],
      cropSheetSwapTasks: {},

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
          cropSheetSwapTasks: {},
        });
      },

      createRemix: async (config, name) => {
        const snapshotState = useSnapshotStore.getState();
        const snapshotId = snapshotState.meta.id;
        if (!snapshotId) {
          log.warn('createRemix', 'no active snapshot');
          return null;
        }

        const payload = buildRemixClonePayload(
          {
            snapshotId,
            illustration: snapshotState.illustration,
            characters: snapshotState.characters,
            props: snapshotState.props,
          },
          config,
          name,
        );

        // ── Phase 1 text swap ────────────────────────────────────────────
        const humansList = useHumansStore.getState().humans;
        const humansMap: Record<string, Human> = Object.fromEntries(
          humansList.map((h) => [h.id, h]),
        );
        const enabledLanguages = config.languages
          .filter((l) => l.is_enabled)
          .map((l) => l.code);

        const swap = applyTextSwap({
          illustration: payload.illustration,
          remixCharacters: payload.characters,
          configCharacters: config.characters,
          enabledLanguages,
          humans: humansMap,
        });

        const finalPayload = { ...payload, illustration: swap.illustration };

        log.info('createRemix', 'insert', { snapshotId, name: finalPayload.name });
        const { data, error } = await supabase
          .from('remixes')
          .insert(finalPayload)
          .select('*')
          .single();

        if (error || !data) {
          log.error('createRemix', 'failed', { error: error?.message });
          return null;
        }

        const remix = mapRowToRemix(data);
        set((s) => ({
          remixes: [...s.remixes, remix],
          activeRemixId: remix.id,
        }));

        if (swap.warnings.length > 0) {
          log.warn('createRemix', 'text swap warnings', {
            remixId: remix.id,
            warningCount: swap.warnings.length,
            matchCount: swap.matchCount,
            chunksMarkedUnsynced: swap.chunksMarkedUnsynced,
            warnings: swap.warnings,
          });
        }

        // ── Phase 2 auto-trigger audio swap (fire-and-forget) ───────────
        log.info('createRemix', 'auto-trigger audio swap', { remixId: remix.id });
        void get()
          .startAudioJob(remix.id, { triggeredBy: 'auto-create' })
          .catch((err) => {
            log.warn('createRemix', 'audio swap enqueue failed (non-blocking)', {
              remixId: remix.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });

        return remix;
      },

      updateRemixConfig: async (id, patch) => {
        const prev = get().remixes.find((r) => r.id === id);
        if (!prev) {
          log.warn('updateRemixConfig', 'not found', { id });
          return false;
        }

        set((s) => ({
          remixes: s.remixes.map((r) =>
            r.id === id ? { ...r, remix_config: patch } : r,
          ),
        }));

        const { error } = await supabase
          .from('remixes')
          .update({ remix_config: patch })
          .eq('id', id);

        if (error) {
          log.error('updateRemixConfig', 'rollback', { id, error: error.message });
          set((s) => ({
            remixes: s.remixes.map((r) => (r.id === id ? prev : r)),
          }));
          return false;
        }
        return true;
      },

      renameRemix: async (id, name) => {
        const trimmed = name.trim() || 'Untitled Remix';
        const prev = get().remixes.find((r) => r.id === id);
        if (!prev) return false;

        set((s) => ({
          remixes: s.remixes.map((r) =>
            r.id === id ? { ...r, name: trimmed } : r,
          ),
        }));

        const { error } = await supabase
          .from('remixes')
          .update({ name: trimmed })
          .eq('id', id);

        if (error) {
          log.error('renameRemix', 'rollback', { id, error: error.message });
          set((s) => ({
            remixes: s.remixes.map((r) => (r.id === id ? prev : r)),
          }));
          return false;
        }
        return true;
      },

      deleteRemix: async (id) => {
        const prevList = get().remixes;
        const prevActiveId = get().activeRemixId;
        const wasActive = prevActiveId === id;

        // Best-effort cancel any active jobs for the deleted remix.
        const active = get().jobs.filter(
          (j) =>
            j.remixId === id &&
            (j.status === 'queued' || j.status === 'running'),
        );
        for (const job of active) {
          void get()
            .cancelJob(job.id)
            .catch((err) => {
              log.warn('deleteRemix', 'cancel job failed (non-blocking)', {
                jobId: job.id,
                error: err instanceof Error ? err.message : String(err),
              });
            });
        }

        set((s) => {
          // Sweep ephemeral swap tasks belonging to the deleted remix.
          const prefix = `${id}:`;
          const sweptTasks: Record<CropSheetSwapTaskKey, SwapTaskStatus> = {};
          for (const [taskKey, status] of Object.entries(s.cropSheetSwapTasks)) {
            if (!taskKey.startsWith(prefix)) sweptTasks[taskKey] = status;
          }
          return {
            remixes: s.remixes.filter((r) => r.id !== id),
            activeRemixId: wasActive
              ? (s.remixes.find((r) => r.id !== id)?.id ?? null)
              : s.activeRemixId,
            cropSheetSwapTasks: sweptTasks,
          };
        });

        const { error } = await supabase.from('remixes').delete().eq('id', id);
        if (error) {
          log.error('deleteRemix', 'rollback', { id, error: error.message });
          // FUTURE: when startCropSheetSwap writes cropSheetSwapTasks (POST
          // branch), also capture + restore the swept tasks here — currently
          // the map is always empty (no-op) so there is nothing to restore.
          set({ remixes: prevList, activeRemixId: prevActiveId });
          return false;
        }
        return true;
      },

      setActiveRemixId: (id) => set({ activeRemixId: id }),

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
          return { jobs: [...s.jobs, seed] };
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
          return { jobs: [...s.jobs, seed] };
        });

        return {
          kind: 'enqueued',
          jobId: enqueued.job_id,
          totalSteps: enqueued.total_steps,
          chunksToRegen: enqueued.chunks_to_regen,
          textboxesToRecombine: enqueued.textboxes_to_recombine,
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

      // ── Crop sheet swap (modal-driven) ─────────────────────────────────
      startCropSheetSwap: async (params) => {
        const taskKey = buildSwapTaskKey(
          params.remixId,
          params.type,
          params.key,
          params.cropSheetIndex,
        );
        log.info('startCropSheetSwap', 'invoked', {
          taskKey,
          mode: params.mode,
        });

        // Guard double-fire — a running task for this sheet wins.
        if (get().cropSheetSwapTasks[taskKey]?.state === 'running') {
          log.debug('startCropSheetSwap', 'blocked — task already running', {
            taskKey,
          });
          return;
        }

        // Validate refine input before any work.
        if (params.mode === 'refine' && !params.prompt?.trim()) {
          log.warn('startCropSheetSwap', 'refine missing prompt — abort', {
            taskKey,
          });
          return;
        }

        // ── DEFERRED: swap API endpoint not yet implemented (design §5 open
        //    item). When ready, replace this block with:
        //      set task → { state:'running', mode }
        //      POST swap API → success: patchRemixCropSheets(swap_results) +
        //        clear task; error: set task → { state:'error', mode, message }
        log.warn(
          'startCropSheetSwap',
          'NO-OP — swap API endpoint not implemented (deferred)',
          { taskKey, mode: params.mode },
        );
        // Task stays idle (never set running/error) → UI never stuck spinning.
        return;
      },

      patchRemixIllustration: (id, spreads) =>
        set((s) => ({
          remixes: s.remixes.map((r) =>
            r.id === id
              ? {
                  ...r,
                  illustration: { ...r.illustration, spreads },
                }
              : r,
          ),
        })),

      patchRemixCropSheets: (id, updates) =>
        set((s) => ({
          remixes: s.remixes.map((r) => {
            if (r.id !== id) return r;
            const next = { ...r };
            for (const u of updates) {
              if (u.type === 'character') {
                next.characters = next.characters.map((c) =>
                  c.key === u.key ? applySheetPatch(c, u) : c,
                );
              } else if (u.type === 'prop') {
                next.props = next.props.map((p) =>
                  p.key === u.key ? applySheetPatch(p, u) : p,
                );
              } else {
                next.mixes = next.mixes.map((m) =>
                  // Mix has no `key` field — match by canonical mix key.
                  canonicalMixKey(m.keys) === u.key ? applySheetPatch(m, u) : m,
                );
              }
            }
            return next;
          }),
        })),
    })),
    { name: 'remix-store' },
  ),
);

function applySheetPatch<T extends { crop_sheets: RemixCropSheet[] }>(
  entity: T,
  update: RemixCropSheetPatch,
): T {
  return {
    ...entity,
    crop_sheets: entity.crop_sheets.map((sheet, idx) =>
      idx === update.sheetIndex ? { ...sheet, ...update.patch } : sheet,
    ),
  };
}

// ── Module-level snapshot subscription ───────────────────────────────────────
// Reload remixes when the active snapshot id changes; clear on logout/reset.

useSnapshotStore.subscribe(
  (s) => s.meta.id,
  (snapshotId) => {
    if (snapshotId) {
      void useRemixStore.getState().syncFromServer(snapshotId);
    } else {
      useRemixStore.getState().clearAll();
    }
  },
);

// ── Module-level background_jobs realtime subscription ───────────────────────
// Subscribe per-user; tear down + re-open when the active user id changes.

let activeJobSubscription:
  | { userId: string; sub: ReturnType<typeof subscribeBackgroundJobs> }
  | null = null;
let lastSubscribedUserId: string | null = null;

function ensureJobsSubscription(userId: string | null | undefined): void {
  if (userId === lastSubscribedUserId) return;

  if (activeJobSubscription) {
    log.info('ensureJobsSubscription', 'tear down previous', {
      userId: activeJobSubscription.userId,
    });
    unsubscribeBackgroundJobs(activeJobSubscription.sub);
    activeJobSubscription = null;
  }
  lastSubscribedUserId = userId ?? null;

  if (!userId) {
    log.info('ensureJobsSubscription', 'no user — cleared jobs');
    useRemixStore.setState({ jobs: [] });
    return;
  }

  log.info('ensureJobsSubscription', 'subscribe', { userId });
  void useRemixStore
    .getState()
    .syncJobsFromServer(userId)
    .catch((err) => {
      log.warn('ensureJobsSubscription', 'initial sync failed', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

  const sub = subscribeBackgroundJobs(
    userId,
    (event) => useRemixStore.getState().applyServerEvent(event),
    () => {
      void useRemixStore.getState().syncJobsFromServer(userId);
    },
  );
  activeJobSubscription = { userId, sub };
}

// Listen for auth user changes (auth-store doesn't use subscribeWithSelector
// so we read full state and check userId-changed manually).
useAuthStore.subscribe((state) => {
  ensureJobsSubscription(state.user?.id ?? null);
});

// Kick off subscription if auth is already initialized at module load time.
{
  const initialUserId = useAuthStore.getState().user?.id ?? null;
  if (initialUserId) {
    ensureJobsSubscription(initialUserId);
  }
}

// ── Selectors ────────────────────────────────────────────────────────────────

export const useRemixes = (): Remix[] => useRemixStore((s) => s.remixes);

export const useActiveRemixId = (): string | null =>
  useRemixStore((s) => s.activeRemixId);

export const useActiveRemix = (): Remix | null =>
  useRemixStore((s) =>
    s.activeRemixId
      ? s.remixes.find((r) => r.id === s.activeRemixId) ?? null
      : null,
  );

export const useRemixById = (id: string | null | undefined): Remix | null =>
  useRemixStore((s) =>
    id ? s.remixes.find((r) => r.id === id) ?? null : null,
  );

const EMPTY_JOBS: RemixJob[] = [];

export const useJobsForRemix = (remixId: string): RemixJob[] =>
  useRemixStore(
    useShallow((s) => s.jobs.filter((j) => j.remixId === remixId) ?? EMPTY_JOBS),
  );

export const useLatestAudioJob = (remixId: string): RemixJob | null =>
  useRemixStore((s) => {
    const matches = s.jobs.filter(
      (j) => j.remixId === remixId && j.phase === 'audio',
    );
    if (matches.length === 0) return null;
    // Sort DESC by createdAt — latest first.
    return matches.reduce((latest, cur) =>
      cur.createdAt > latest.createdAt ? cur : latest,
    );
  });

export const useLatestImageJob = (remixId: string): RemixJob | null =>
  useRemixStore((s) => {
    const matches = s.jobs.filter(
      (j) => j.remixId === remixId && j.phase === 'image',
    );
    if (matches.length === 0) return null;
    return matches.reduce((latest, cur) =>
      cur.createdAt > latest.createdAt ? cur : latest,
    );
  });

export const useHasPendingJob = (): boolean =>
  useRemixStore((s) =>
    s.jobs.some((j) => j.status === 'queued' || j.status === 'running'),
  );

/** Resolves a single entity (character | prop | mix) from a remix into the
 *  normalized `RemixEntityRef` projection used by SwapCropSheetModal. Returns
 *  `null` when the remix or entity is missing (e.g. deleted realtime). */
export const useRemixEntity = (
  remixId: string,
  type: 'character' | 'prop' | 'mix',
  key: string,
): RemixEntityRef | null =>
  useRemixStore(
    useShallow((s): RemixEntityRef | null => {
      const remix = s.remixes.find((r) => r.id === remixId);
      if (!remix) return null;

      let ent: { name: string; crop_sheets: RemixCropSheet[] } | undefined;
      if (type === 'character') {
        ent = remix.characters.find((c) => c.key === key);
      } else if (type === 'prop') {
        ent = remix.props.find((p) => p.key === key);
      } else {
        ent = remix.mixes.find((m) => canonicalMixKey(m.keys) === key);
      }
      if (!ent) return null;

      return { type, key, name: ent.name, crop_sheets: ent.crop_sheets };
    }),
  );

/** Reads the ephemeral swap task for a specific crop sheet. Defaults to a
 *  stable idle object so callers never trigger a re-render on the default. */
export const useCropSheetSwapTask = (
  remixId: string,
  type: 'character' | 'prop' | 'mix',
  key: string,
  sheetIndex: number,
): SwapTaskStatus =>
  useRemixStore(
    (s) =>
      s.cropSheetSwapTasks[buildSwapTaskKey(remixId, type, key, sheetIndex)] ??
      IDLE_SWAP_TASK,
  );

export const useRemixActions = () =>
  useRemixStore(
    useShallow((s) => ({
      createRemix: s.createRemix,
      updateRemixConfig: s.updateRemixConfig,
      renameRemix: s.renameRemix,
      deleteRemix: s.deleteRemix,
      setActiveRemixId: s.setActiveRemixId,
      startAudioJob: s.startAudioJob,
      startImageJob: s.startImageJob,
      cancelJob: s.cancelJob,
      dismissJob: s.dismissJob,
      syncFromServer: s.syncFromServer,
      syncJobsFromServer: s.syncJobsFromServer,
      patchRemixIllustration: s.patchRemixIllustration,
      patchRemixCropSheets: s.patchRemixCropSheets,
      startCropSheetSwap: s.startCropSheetSwap,
    })),
  );

// Re-export selector hook (Phase 03) for convenient single-import surface.
export { useAudioJobBadgeState, deriveAudioJobBadgeState } from './audio-job-badge-state';
