// remix-store/index.ts — Standalone Zustand store managing remix rows +
// ephemeral inject jobs. Frontend owns CRUD via supabase-js (RLS-protected).

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type {
  InjectJob,
  Remix,
  RemixConfig,
  RemixCropSheet,
  RemixSpread,
} from '@/types/remix';
import { buildRemixClonePayload } from './clone-builder';
import { mapRowToRemix } from './supabase-mapping';
import { runInjectJob } from './inject-runner';
import { useSnapshotStore } from '../snapshot-store';

const log = createLogger('Store', 'RemixStore');

// ── Patch shape exposed by inject runner helpers ─────────────────────────────

export interface RemixCropSheetPatch {
  type: 'character' | 'prop' | 'mix';
  key: string;
  /** Index into entity.crop_sheets[]. */
  sheetIndex: number;
  patch: Partial<RemixCropSheet>;
}

// ── Store shape ──────────────────────────────────────────────────────────────

interface RemixStore {
  remixes: Remix[];
  activeRemixId: string | null;
  injectJobs: InjectJob[];

  syncFromServer: (snapshotId: string) => Promise<void>;
  clearAll: () => void;

  createRemix: (config: RemixConfig, name?: string) => Promise<Remix | null>;
  updateRemixConfig: (id: string, patch: RemixConfig) => Promise<boolean>;
  renameRemix: (id: string, name: string) => Promise<boolean>;
  deleteRemix: (id: string) => Promise<boolean>;
  setActiveRemixId: (id: string | null) => void;

  startInjectJob: (remixId: string) => string | null;
  cancelInjectJob: (jobId: string) => void;
  dismissInjectJob: (jobId: string) => void;
  clearFinishedJobs: () => void;

  patchRemixIllustration: (id: string, spreads: RemixSpread[]) => void;
  patchRemixCropSheets: (id: string, updates: RemixCropSheetPatch[]) => void;
}

export const useRemixStore = create<RemixStore>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      remixes: [],
      activeRemixId: null,
      injectJobs: [],

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
        set({ remixes: [], activeRemixId: null, injectJobs: [] });
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

        log.info('createRemix', 'insert', { snapshotId, name: payload.name });
        const { data, error } = await supabase
          .from('remixes')
          .insert(payload)
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

        set((s) => ({
          remixes: s.remixes.filter((r) => r.id !== id),
          activeRemixId: wasActive
            ? (s.remixes.find((r) => r.id !== id)?.id ?? null)
            : s.activeRemixId,
          injectJobs: s.injectJobs.map((j) =>
            j.remixId === id ? { ...j, cancelFlag: true } : j,
          ),
        }));

        const { error } = await supabase.from('remixes').delete().eq('id', id);
        if (error) {
          log.error('deleteRemix', 'rollback', { id, error: error.message });
          set({ remixes: prevList, activeRemixId: prevActiveId });
          return false;
        }
        return true;
      },

      setActiveRemixId: (id) => set({ activeRemixId: id }),

      startInjectJob: (remixId) => {
        const existing = get().injectJobs.find(
          (j) =>
            j.remixId === remixId &&
            (j.status === 'pending' || j.status === 'running'),
        );
        if (existing) {
          log.warn('startInjectJob', 'duplicate prevented', { remixId });
          return existing.id;
        }

        const job: InjectJob = {
          id: crypto.randomUUID(),
          remixId,
          status: 'pending',
          progress: 0,
          startedAt: new Date().toISOString(),
          errors: [],
          cancelFlag: false,
        };
        set((s) => ({ injectJobs: [...s.injectJobs, job] }));

        // Fire-and-forget — Phase 08 runner performs the actual work.
        void runInjectJob(job.id, useRemixStore);
        return job.id;
      },

      cancelInjectJob: (jobId) =>
        set((s) => ({
          injectJobs: s.injectJobs.map((j) =>
            j.id === jobId ? { ...j, cancelFlag: true } : j,
          ),
        })),

      dismissInjectJob: (jobId) =>
        set((s) => ({
          injectJobs: s.injectJobs.filter((j) => {
            if (j.id !== jobId) return true;
            return j.status === 'pending' || j.status === 'running';
          }),
        })),

      clearFinishedJobs: () =>
        set((s) => ({
          injectJobs: s.injectJobs.filter(
            (j) => j.status === 'pending' || j.status === 'running',
          ),
        })),

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
                  // Mix has no `key` field — match by composed name.
                  m.name === u.key ? applySheetPatch(m, u) : m,
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

const EMPTY_JOBS: InjectJob[] = [];

export const useInjectJobsForRemix = (remixId: string): InjectJob[] =>
  useRemixStore(
    useShallow((s) => s.injectJobs.filter((j) => j.remixId === remixId) ?? EMPTY_JOBS),
  );

export const useLatestInjectJob = (remixId: string): InjectJob | null =>
  useRemixStore((s) => {
    const matches = s.injectJobs.filter((j) => j.remixId === remixId);
    return matches.length === 0 ? null : matches[matches.length - 1];
  });

export const useHasPendingInject = (): boolean =>
  useRemixStore((s) =>
    s.injectJobs.some((j) => j.status === 'pending' || j.status === 'running'),
  );

export const useRemixActions = () =>
  useRemixStore(
    useShallow((s) => ({
      createRemix: s.createRemix,
      updateRemixConfig: s.updateRemixConfig,
      renameRemix: s.renameRemix,
      deleteRemix: s.deleteRemix,
      setActiveRemixId: s.setActiveRemixId,
      startInjectJob: s.startInjectJob,
      cancelInjectJob: s.cancelInjectJob,
      dismissInjectJob: s.dismissInjectJob,
      clearFinishedJobs: s.clearFinishedJobs,
      syncFromServer: s.syncFromServer,
      patchRemixIllustration: s.patchRemixIllustration,
      patchRemixCropSheets: s.patchRemixCropSheets,
    })),
  );
