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
  REMIX_SWAP_TYPES,
  useBackgroundJobsStore,
} from '../background-jobs-store';
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
export type { CropSheetUpdate, RemixCropSheetPatch } from './types';

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

// ── BackgroundJobsStore consumer (ADR-037) ───────────────────────────────────
// RemixStore is now a CONSUMER of the unified store: instead of owning its own
// `bg-jobs-` channel, it registers a `subscribeJobs` listener for the 3 remix
// swap types and derives the `jobs[]` projection from those events. The shared
// store owns the single channel + reheal + poll + top-up. Re-register when the
// active user changes; the shared store clears all listeners on logout teardown.

let remixJobConsumerUnsub: (() => void) | null = null;
let lastConsumerUserId: string | null = null;

function ensureRemixJobConsumer(userId: string | null | undefined): void {
  if (userId === lastConsumerUserId) return;
  lastConsumerUserId = userId ?? null;

  if (remixJobConsumerUnsub) {
    remixJobConsumerUnsub();
    remixJobConsumerUnsub = null;
  }

  if (!userId) {
    log.info('ensureRemixJobConsumer', 'no user — cleared jobs');
    useRemixStore.setState({ jobs: [] });
    return;
  }

  log.info('ensureRemixJobConsumer', 'subscribe remix swap jobs', { userId });
  remixJobConsumerUnsub = useBackgroundJobsStore
    .getState()
    .subscribeJobs({ types: [...REMIX_SWAP_TYPES] }, (event) =>
      useRemixStore.getState().onRemixJobEvent(event),
    );
}

// Listen for auth user changes (auth-store doesn't use subscribeWithSelector
// so we read full state and check userId-changed manually).
useAuthStore.subscribe((state) => {
  ensureRemixJobConsumer(state.user?.id ?? null);
});

// Register if auth is already initialized at module load time.
{
  const initialUserId = useAuthStore.getState().user?.id ?? null;
  if (initialUserId) {
    ensureRemixJobConsumer(initialUserId);
  }
}

// ── Barrel re-export ─────────────────────────────────────────────────────────
// Single-import surface: selector hooks + audio-job-badge helpers.

export * from './selectors';
export { useAudioJobBadgeState, deriveAudioJobBadgeState } from './audio-job-badge-state';
