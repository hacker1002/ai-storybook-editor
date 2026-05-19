// remix-store/index.ts — Standalone Zustand store managing remix rows + remote
// background_jobs (audio/image swap). Frontend owns remix CRUD via supabase-js
// (RLS-protected); jobs are read-only via realtime channel + REST enqueue.

import { useMemo } from 'react';
import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type {
  BackgroundJobRow,
  CLIENT_AUDIO_CHUNK_CAP as CapType,
  CropSheetBuildStatus,
  EnqueueRemixJobOutcome,
  EntitySwapTaskKey,
  Remix,
  RemixCharacter,
  RemixConfig,
  RemixCropSheet,
  RemixEntityRef,
  RemixJob,
  RemixMix,
  RemixProp,
  RemixServerEvent,
  RemixSpread,
  StartEntitySwapParams,
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
import { buildRemixCropSheets } from '@/apis/remix-api';
import { toast } from 'sonner';

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

// ── Entity swap task helpers ─────────────────────────────────────────────────

/** Minimum crop sheets an entity must keep — `removeCropSheet` refuses to drop
 *  below this so every entity always has at least one sheet to render. */
const SHEET_MIN = 1;

/** Composes the `entitySwapTasks` map key (per-KEY, not per-sheet). Shared
 *  between action + selector so the format never drifts. */
function buildEntityTaskKey(
  remixId: string,
  type: 'character' | 'prop' | 'mix',
  key: string,
): EntitySwapTaskKey {
  return `${remixId}:${type}:${key}`;
}

/** Stable reference for the default idle task — avoids a fresh object per
 *  `useEntitySwapTask` call (would defeat selector re-render guards). */
const IDLE_SWAP_TASK: SwapTaskStatus = { state: 'idle' };

/** Immutable single-key removal from a record. Returns a new object without
 *  `key`; used to clear ephemeral per-remix task entries. */
function omitKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

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
  /** Ephemeral per-KEY swap task map (memory-only — not persisted, no
   *  background_jobs row). Key = `${remixId}:${type}:${key}`. v1: always idle
   *  (swap deferred — `startEntitySwap` is a no-op stub). */
  entitySwapTasks: Record<EntitySwapTaskKey, SwapTaskStatus>;
  /** Ephemeral per-remix crop-sheet build task map (key = remixId). Memory-only
   *  — synchronous endpoint, no background_jobs row, lost on refresh (v1). */
  cropSheetBuildTasks: Record<string, CropSheetBuildStatus>;

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

  /** Modal-driven per-KEY swap trigger. DEFERRED no-op (Validation S1) — guard
   *  (`useAnySwapRunning`) + remix/entity resolution + log are real; the swap
   *  loop + API call + persist land when the swap API ships. Never sets
   *  `running`/`error` so the UI never spins. */
  startEntitySwap: (params: StartEntitySwapParams) => Promise<void>;

  /** Appends one empty crop sheet to an entity's `crop_sheets[]` and persists
   *  the owning JSONB column (characters/props/mixes) to Supabase. Optimistic
   *  with rollback on failure. */
  appendCropSheet: (
    remixId: string,
    type: 'character' | 'prop' | 'mix',
    key: string,
  ) => Promise<boolean>;

  /** Removes the crop sheet at `sheetIndex` from an entity's `crop_sheets[]`
   *  and persists the owning JSONB column. No-op when only `SHEET_MIN` sheets
   *  remain. Optimistic with rollback on failure. */
  removeCropSheet: (
    remixId: string,
    type: 'character' | 'prop' | 'mix',
    key: string,
    sheetIndex: number,
  ) => Promise<boolean>;

  /** Phase 1.5 — builds crop sheets for a remix's characters/props. Auto-fired
   *  fire-and-forget after createRemix; also the retry entry point. On success
   *  (full or partial) refetches the remix row to materialize crop_sheets[]
   *  (no realtime remixes channel exists). */
  buildCropSheets: (remixId: string) => Promise<void>;
}

export const useRemixStore = create<RemixStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      remixes: [],
      activeRemixId: null,
      jobs: [],
      entitySwapTasks: {},
      cropSheetBuildTasks: {},

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
          cropSheetBuildTasks: {},
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

        // ── Phase 1.5 auto-trigger crop-sheet build (fire-and-forget) ───
        // Parallel with audio: writes characters/props/mixes columns vs audio's
        // illustration column — Postgres row-lock serializes the two UPDATEs.
        // buildCropSheets catches its own errors; the outer .catch is defensive.
        log.info('createRemix', 'auto-trigger crop-sheet build', { remixId: remix.id });
        void get()
          .buildCropSheets(remix.id)
          .catch((err) => {
            log.warn('createRemix', 'crop-sheet build failed (non-blocking)', {
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
          const sweptTasks: Record<EntitySwapTaskKey, SwapTaskStatus> = {};
          for (const [taskKey, status] of Object.entries(s.entitySwapTasks)) {
            if (!taskKey.startsWith(prefix)) sweptTasks[taskKey] = status;
          }
          return {
            remixes: s.remixes.filter((r) => r.id !== id),
            activeRemixId: wasActive
              ? (s.remixes.find((r) => r.id !== id)?.id ?? null)
              : s.activeRemixId,
            entitySwapTasks: sweptTasks,
            cropSheetBuildTasks: omitKey(s.cropSheetBuildTasks, id),
          };
        });

        const { error } = await supabase.from('remixes').delete().eq('id', id);
        if (error) {
          log.error('deleteRemix', 'rollback', { id, error: error.message });
          // FUTURE: when startEntitySwap writes entitySwapTasks (swap loop),
          // also capture + restore the swept tasks here — currently the map is
          // always empty (no-op stub) so there is nothing to restore.
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

      // ── Entity swap (modal-driven, per-key) ────────────────────────────
      // DEFERRED stub (Validation S1) — swap API not ready in v1. Guard +
      // remix/entity resolution + log are real; the swap loop + POST + persist
      // land when the swap API ships. Never sets `running`/`error` so the
      // entitySwapTasks map stays empty and the UI never spins.
      startEntitySwap: async (params) => {
        const taskKey = buildEntityTaskKey(
          params.remixId,
          params.type,
          params.key,
        );
        log.info('startEntitySwap', 'invoked', {
          taskKey,
          type: params.type,
          key: params.key,
        });

        // Guard — only one swap may run per remix at a time. (Always passes in
        // v1 since the stub never sets a `running` task, but kept real so the
        // contract holds when the swap loop lands.)
        const prefix = `${params.remixId}:`;
        const anyRunning = Object.entries(get().entitySwapTasks).some(
          ([k, v]) => k.startsWith(prefix) && v.state === 'running',
        );
        if (anyRunning) {
          log.debug('startEntitySwap', 'blocked — a swap is already running', {
            remixId: params.remixId,
          });
          return;
        }

        // Resolve remix + entity so the contract (and logs) match the real
        // implementation; bail with a warn when either is missing.
        const remix = get().remixes.find((r) => r.id === params.remixId);
        if (!remix) {
          log.warn('startEntitySwap', 'remix not found — abort', {
            remixId: params.remixId,
          });
          return;
        }
        const entity = resolveEntity(remix, params.type, params.key);
        if (!entity) {
          log.warn('startEntitySwap', 'entity not found — abort', {
            remixId: params.remixId,
            type: params.type,
            key: params.key,
          });
          return;
        }

        // ── DEFERRED: swap API endpoint not yet implemented (plan §unresolved
        //    #1). When ready, replace this block with:
        //      set entitySwapTasks[taskKey] → { state:'running', current:0, total }
        //      FOR each crop sheet → POST /api/remix/swap-character-crop-sheet
        //      gather CropSheetPatch[] → patchRemixCropSheets + persist Supabase
        //      all OK → clear task; ≥1 fail → { state:'error', message, failedSheets }
        log.warn(
          'startEntitySwap',
          'NO-OP — swap API endpoint not implemented (deferred)',
          { taskKey, type: params.type, sheetCount: entity.crop_sheets.length },
        );
        // Task stays idle (never set running/error) → UI never stuck spinning.
        return;
      },

      // ── Crop sheet count (modal-driven append / remove) ────────────────
      appendCropSheet: async (remixId, type, key) => {
        log.info('appendCropSheet', 'invoked', { remixId, type, key });
        // Title = "<entity name> <n+1>" where n = existing sheet count BEFORE
        // append. Initial clone keeps unsuffixed name (see clone-builder
        // `makeDefaultSheet`), so first append yields e.g. "Leela 2".
        const remix = get().remixes.find((r) => r.id === remixId);
        const entity = remix ? resolveEntity(remix, type, key) : null;
        const nextIndex = (entity?.crop_sheets.length ?? 0) + 1;
        const baseName = entity?.name ?? 'Sheet';
        const newSheet: RemixCropSheet = {
          title: `${baseName} — sheet ${nextIndex}`,
          image_url: '',
          swap_results: [],
          crops: [],
        };
        return mutateEntityCropSheets(
          { set, get },
          'appendCropSheet',
          remixId,
          type,
          key,
          (sheets) => [...sheets, newSheet],
        );
      },

      removeCropSheet: async (remixId, type, key, sheetIndex) => {
        log.info('removeCropSheet', 'invoked', {
          remixId,
          type,
          key,
          sheetIndex,
        });
        return mutateEntityCropSheets(
          { set, get },
          'removeCropSheet',
          remixId,
          type,
          key,
          (sheets) => {
            if (sheets.length <= SHEET_MIN) {
              log.warn('removeCropSheet', 'at SHEET_MIN — skip', {
                remixId,
                key,
                sheetCount: sheets.length,
              });
              return null;
            }
            if (sheetIndex < 0 || sheetIndex >= sheets.length) {
              log.warn('removeCropSheet', 'sheetIndex out of range — skip', {
                remixId,
                key,
                sheetIndex,
                sheetCount: sheets.length,
              });
              return null;
            }
            return sheets.filter((_, i) => i !== sheetIndex);
          },
        );
      },

      // ── Crop sheet build (Phase 1.5 — auto + retry) ────────────────────
      buildCropSheets: async (remixId) => {
        const remix = get().remixes.find((r) => r.id === remixId);
        if (!remix) {
          // Race: createRemix fired this before a concurrent deleteRemix.
          log.warn('buildCropSheets', 'remix not found — skip', { remixId });
          return;
        }

        // Guard double-fire — a build already in flight wins (mirrors
        // startCropSheetSwap). The badge hides the retry button while running,
        // so this only defends against races (auto-trigger + manual retry).
        if (get().cropSheetBuildTasks[remixId]?.state === 'running') {
          log.debug('buildCropSheets', 'blocked — build already running', {
            remixId,
          });
          return;
        }

        const characterKeys = remix.characters.map((c) => c.key);
        const propKeys = remix.props.map((p) => p.key);

        // Endpoint rejects an empty character∪prop union (400). A remix with
        // only narrator/language choices has nothing to build → no-op, badge
        // stays idle.
        if (characterKeys.length === 0 && propKeys.length === 0) {
          log.info('buildCropSheets', 'skip — no character/prop', { remixId });
          return;
        }

        set((s) => ({
          cropSheetBuildTasks: {
            ...s.cropSheetBuildTasks,
            [remixId]: { state: 'running' },
          },
        }));
        log.info('buildCropSheets', 'build start', {
          remixId,
          charCount: characterKeys.length,
          propCount: propKeys.length,
        });

        try {
          const result = await buildRemixCropSheets(
            remixId,
            characterKeys,
            propKeys,
          );

          // ImageApiFailure (4xx/5xx pre-flight) carries no `data` field —
          // discriminate on its presence, NOT on `success` (a partial build
          // returns HTTP 200 with success:false too). `|| !result.data` also
          // catches a malformed 200 body lacking `data` → treat as failure.
          if (!('data' in result) || !result.data) {
            throw new Error(result.error ?? 'Crop sheet build failed');
          }

          const { summary } = result.data;
          // Refetch on BOTH full-success and partial: succeeded groups already
          // persisted (atomic 1-UPDATE) so the user sees them immediately even
          // when the badge stays in `error` to drive a retry. Best-effort —
          // refetchRemix swallows its own errors and never throws, so the badge
          // still clears on failure; stale crop_sheets[] heal on a later
          // refetch trigger (audio job terminal transition / next build).
          await get().refetchRemix(remixId);

          if (summary.failed > 0) {
            const message = `${summary.failed}/${summary.total_groups} groups failed`;
            set((s) => ({
              cropSheetBuildTasks: {
                ...s.cropSheetBuildTasks,
                [remixId]: { state: 'error', message },
              },
            }));
            log.warn('buildCropSheets', 'partial', {
              remixId,
              failed: summary.failed,
              total: summary.total_groups,
            });
            toast.warning(
              `Crop sheets partial for "${remix.name}" — ${message}, retry from sidebar`,
            );
          } else {
            set((s) => ({
              cropSheetBuildTasks: omitKey(s.cropSheetBuildTasks, remixId),
            }));
            log.info('buildCropSheets', 'build done', {
              remixId,
              totalSheets: summary.total_sheets,
            });
            toast.success(
              `Crop sheets ready for "${remix.name}" — ${summary.total_sheets} sheets`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          set((s) => ({
            cropSheetBuildTasks: {
              ...s.cropSheetBuildTasks,
              [remixId]: { state: 'error', message: msg },
            },
          }));
          log.error('buildCropSheets', 'build failed', { remixId, error: msg });
          toast.error(`Crop sheets failed for "${remix.name}": ${msg}`);
        }
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

// ── Entity / crop-sheet helpers ──────────────────────────────────────────────

/** Normalized projection of one remix entity (character | prop | mix). Used by
 *  `startEntitySwap` resolution and selectors so the shape never drifts. */
type ResolvedEntity = {
  name: string;
  crop_sheets: RemixCropSheet[];
};

/** Resolves a single entity from a remix by type + key. Mix matches by
 *  `canonicalMixKey(keys)`. Returns `null` when the entity is missing. */
function resolveEntity(
  remix: Remix,
  type: 'character' | 'prop' | 'mix',
  key: string,
): ResolvedEntity | null {
  if (type === 'character') {
    return remix.characters.find((c) => c.key === key) ?? null;
  }
  if (type === 'prop') {
    return remix.props.find((p) => p.key === key) ?? null;
  }
  return remix.mixes.find((m) => canonicalMixKey(m.keys) === key) ?? null;
}

/** The JSONB column an entity type lives in. `appendCropSheet`/`removeCropSheet`
 *  persist exactly this one column. */
type EntityColumn = 'characters' | 'props' | 'mixes';

const ENTITY_COLUMN: Record<'character' | 'prop' | 'mix', EntityColumn> = {
  character: 'characters',
  prop: 'props',
  mix: 'mixes',
};

/** Store accessor pair — narrow alias so module-level helpers stay typed
 *  without re-importing the full zustand store type. */
type StoreApi = {
  set: (
    partial: Partial<RemixStore> | ((s: RemixStore) => Partial<RemixStore>),
  ) => void;
  get: () => RemixStore;
};

/** Persists the owning JSONB column (characters | props | mixes) of a remix to
 *  Supabase. Reads the CURRENT in-store remix so it always writes the freshest
 *  local state. On failure: log.error + toast — NO rollback (caller owns the
 *  optimistic update / rollback decision). Returns `true` on success. */
async function persistCropSheetsToSupabase(
  get: StoreApi['get'],
  fn: string,
  remixId: string,
  type: 'character' | 'prop' | 'mix',
): Promise<boolean> {
  const remix = get().remixes.find((r) => r.id === remixId);
  if (!remix) {
    log.warn('persistCropSheetsToSupabase', 'remix not found — skip persist', {
      remixId,
      caller: fn,
    });
    return false;
  }

  const column = ENTITY_COLUMN[type];
  log.debug('persistCropSheetsToSupabase', 'persist column', {
    remixId,
    column,
    caller: fn,
  });

  const { error } = await supabase
    .from('remixes')
    .update({ [column]: remix[column] })
    .eq('id', remixId);

  if (error) {
    log.error('persistCropSheetsToSupabase', 'persist failed', {
      remixId,
      column,
      caller: fn,
      error: error.message,
    });
    return false;
  }
  return true;
}

/** DRY core for `appendCropSheet` / `removeCropSheet`. Resolves the entity,
 *  applies `fn` to its `crop_sheets[]`, updates local state optimistically,
 *  persists the owning column, and rolls back on persist failure.
 *
 *  `fn` returns `null` to signal a guarded no-op (e.g. at SHEET_MIN) — the
 *  store is left untouched and the call resolves `false`. */
async function mutateEntityCropSheets(
  { set, get }: StoreApi,
  fn: string,
  remixId: string,
  type: 'character' | 'prop' | 'mix',
  key: string,
  transform: (sheets: RemixCropSheet[]) => RemixCropSheet[] | null,
): Promise<boolean> {
  const prev = get().remixes.find((r) => r.id === remixId);
  if (!prev) {
    log.warn('mutateEntityCropSheets', 'remix not found — abort', {
      remixId,
      caller: fn,
    });
    return false;
  }

  const entity = resolveEntity(prev, type, key);
  if (!entity) {
    log.warn('mutateEntityCropSheets', 'entity not found — abort', {
      remixId,
      type,
      key,
      caller: fn,
    });
    return false;
  }

  const nextSheets = transform(entity.crop_sheets);
  if (nextSheets === null) {
    // Guarded no-op — `transform` already logged the reason.
    log.debug('mutateEntityCropSheets', 'transform declined — no-op', {
      remixId,
      key,
      caller: fn,
    });
    return false;
  }

  // Optimistic local update — rebuild the owning column with patched entity.
  log.debug('mutateEntityCropSheets', 'optimistic update', {
    remixId,
    type,
    key,
    caller: fn,
    prevSheetCount: entity.crop_sheets.length,
    nextSheetCount: nextSheets.length,
  });
  set((s) => ({
    remixes: s.remixes.map((r) =>
      r.id === remixId ? applyEntitySheets(r, type, key, nextSheets) : r,
    ),
  }));

  const ok = await persistCropSheetsToSupabase(get, fn, remixId, type);
  if (!ok) {
    log.error('mutateEntityCropSheets', 'persist failed — rollback', {
      remixId,
      key,
      caller: fn,
    });
    set((s) => ({
      remixes: s.remixes.map((r) => (r.id === remixId ? prev : r)),
    }));
    toast.error('Không thể lưu thay đổi crop sheet — đã hoàn tác');
    return false;
  }
  log.info('mutateEntityCropSheets', 'done', {
    remixId,
    type,
    key,
    caller: fn,
    sheetCount: nextSheets.length,
  });
  return true;
}

/** Returns a new Remix with the matched entity's `crop_sheets[]` replaced.
 *  Mix matches by `canonicalMixKey(keys)`. */
function applyEntitySheets(
  remix: Remix,
  type: 'character' | 'prop' | 'mix',
  key: string,
  nextSheets: RemixCropSheet[],
): Remix {
  if (type === 'character') {
    return {
      ...remix,
      characters: remix.characters.map((c): RemixCharacter =>
        c.key === key ? { ...c, crop_sheets: nextSheets } : c,
      ),
    };
  }
  if (type === 'prop') {
    return {
      ...remix,
      props: remix.props.map((p): RemixProp =>
        p.key === key ? { ...p, crop_sheets: nextSheets } : p,
      ),
    };
  }
  return {
    ...remix,
    mixes: remix.mixes.map((m): RemixMix =>
      canonicalMixKey(m.keys) === key ? { ...m, crop_sheets: nextSheets } : m,
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

/** All swappable entities of a remix, grouped by type, projected to the
 *  normalized `RemixEntityRef` shape consumed by SwapCropSheetModal. Returns
 *  `null` when the remix is missing (e.g. deleted via realtime). */
export interface RemixEntities {
  characters: RemixEntityRef[];
  props: RemixEntityRef[];
  mixes: RemixEntityRef[];
}

export const useRemixEntities = (remixId: string): RemixEntities | null => {
  // Select the raw remix row — a referentially stable object that only changes
  // when an action replaces it. `useShallow` on the projected shape would loop:
  // the projection's `.map()` arrays are fresh every call, so a shallow compare
  // never settles. Project under `useMemo` keyed on the stable `remix` instead.
  const remix = useRemixStore(
    (s) => s.remixes.find((r) => r.id === remixId) ?? null,
  );

  return useMemo<RemixEntities | null>(() => {
    if (!remix) return null;
    return {
      characters: remix.characters.map((c) => ({
        type: 'character' as const,
        key: c.key,
        name: c.name,
        crop_sheets: c.crop_sheets,
      })),
      props: remix.props.map((p) => ({
        type: 'prop' as const,
        key: p.key,
        name: p.name,
        crop_sheets: p.crop_sheets,
      })),
      mixes: remix.mixes.map((m) => ({
        type: 'mix' as const,
        key: canonicalMixKey(m.keys),
        name: m.name,
        crop_sheets: m.crop_sheets,
      })),
    };
  }, [remix]);
};

/** Reads the ephemeral swap task for an entity KEY. Defaults to a stable idle
 *  object so callers never trigger a re-render on the default. v1: always idle
 *  (swap deferred — `startEntitySwap` is a no-op stub). */
export const useEntitySwapTask = (
  remixId: string,
  type: 'character' | 'prop' | 'mix',
  key: string,
): SwapTaskStatus =>
  useRemixStore(
    (s) =>
      s.entitySwapTasks[buildEntityTaskKey(remixId, type, key)] ??
      IDLE_SWAP_TASK,
  );

/** True when ANY entity of the remix has a running swap task. Guards the modal
 *  against firing a second swap. v1: always `false` (swap deferred). */
export const useAnySwapRunning = (remixId: string): boolean =>
  useRemixStore((s) => {
    const prefix = `${remixId}:`;
    return Object.entries(s.entitySwapTasks).some(
      ([k, v]) => k.startsWith(prefix) && v.state === 'running',
    );
  });

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
      startEntitySwap: s.startEntitySwap,
      appendCropSheet: s.appendCropSheet,
      removeCropSheet: s.removeCropSheet,
      buildCropSheets: s.buildCropSheets,
    })),
  );

// Re-export selector hooks for a convenient single-import surface.
export { useAudioJobBadgeState, deriveAudioJobBadgeState } from './audio-job-badge-state';
export { useCropSheetBuildState } from './crop-sheet-build-state';
