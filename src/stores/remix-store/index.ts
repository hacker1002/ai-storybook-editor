// remix-store/index.ts — Standalone Zustand store managing remix rows + remote
// background_jobs (audio/image swap). Frontend owns remix CRUD via supabase-js
// (RLS-protected); jobs are read-only via realtime channel + REST enqueue.
//
// This file is compose-only: it spreads the four slices into one store and
// wires module-level subscriptions. State + actions live in `slices/`,
// read-side hooks in `selectors.ts`, types in `types.ts`. Barrel re-exports at
// the bottom keep the public import surface stable for all consumers.

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { createLogger } from '@/utils/logger';
import {
  CLIENT_AUDIO_CHUNK_CAP,
  type CLIENT_AUDIO_CHUNK_CAP as CapType,
} from '@/types/remix';
import {
  subscribeBackgroundJobs,
  unsubscribeBackgroundJobs,
} from './realtime';
import { useSnapshotStore } from '../snapshot-store';
import { useAuthStore } from '../auth-store';
import { createCrudSlice } from './slices/crud-slice';
import { createJobsSlice } from './slices/jobs-slice';
import { createSwapSlice } from './slices/swap-slice';
import { createSyncSlice } from './slices/sync-slice';
import type { RemixStore } from './types';

const log = createLogger('Store', 'RemixStore');

// Re-export so callers don't need a separate import for the cap constant.
export { CLIENT_AUDIO_CHUNK_CAP };
export type { CapType };
export type { RemixCropSheetPatch, RemixEntities } from './types';

export const useRemixStore = create<RemixStore>()(
  devtools(
    subscribeWithSelector((...a) => ({
      ...createCrudSlice(...a),
      ...createJobsSlice(...a),
      ...createSwapSlice(...a),
      ...createSyncSlice(...a),
    })),
    { name: 'remix-store' },
  ),
);

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

// ── Barrel re-export ─────────────────────────────────────────────────────────
// Single-import surface: selector hooks + audio-job-badge helpers.

export * from './selectors';
export { useAudioJobBadgeState, deriveAudioJobBadgeState } from './audio-job-badge-state';
