// content-sync-store/index.ts — Zustand store for the realtime content-sync
// feature (sibling of resource-lock-store). Owns ONE realtime channel per book on
// `collaboration_activity_logs`; each peer INSERT that carries a `metadata.sync`
// envelope becomes a targeted refetch instruction.
//
// THIS PHASE (03) = read-pipeline SKELETON only: connect/disconnect + channel wiring
// + self-filter + sync parse. The version-guard, lock-skip, RPC refetch and
// snapshot-store dispatch are wired in phase 05 (see the TODO in handleActivityInsert).
//
// Non-reactive module scope (the channel handle) is kept OUT of zustand state so
// its churn never triggers a component re-render.

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createLogger } from '@/utils/logger';
import { useAuthStore } from '@/stores/auth-store';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { holdsLiveLock, hasAnyLiveLock, type LockTarget } from '@/stores/resource-lock-store';
import { openActivityLogChannel, type ChannelHandle } from './channel';
import { fetchSnapshotNode } from './rpc';
import type { ActivityLogRawRow, MetadataSync } from './types';

const log = createLogger('Store', 'ContentSyncStore');

/** Channel lifecycle status (primitive → safe for a reactive UI selector). */
export type ContentSyncStatus = 'idle' | 'live' | 'down';

export interface ContentSyncState {
  // === State (reactive) ===
  bookId: string | null;
  /** Current signed-in user id ("me"), resolved once at connect (for self-filter). */
  myUserId: string | null;
  status: ContentSyncStatus;

  // === Realtime lifecycle ===
  connect: (bookId: string) => void;
  disconnect: () => void;

  // === Internal (channel wiring — not for components) ===
  handleActivityInsert: (row: ActivityLogRawRow) => void;
}

// ── Non-reactive module scope ─────────────────────────────────────────────────
let channelHandle: ChannelHandle | null = null;

/**
 * Wrap a SYNCHRONOUS snapshot-store remote merge so the undo/redo capture subscription
 * (edit-history-store) SKIPS it — a peer's realtime edit must never become a local undo
 * step (ADR-045). Sets `isApplyingRemotePatch` around the mutation ONLY (never around an
 * await), so the flag is true exactly while the subtree changes fire synchronously.
 */
function withRemotePatchGuard(apply: () => void): void {
  const store = useSnapshotStore.getState();
  store.setApplyingRemotePatch(true);
  try {
    apply();
  } finally {
    store.setApplyingRemotePatch(false);
  }
}

/** Still viewing the version the event targeted? Re-checked AFTER the RPC await so
 *  navigating to another version mid-fetch never merges cross-version (closes R3). */
function versionStillMatches(eventVersion: string): boolean {
  const cur = useSnapshotStore.getState().meta.id;
  if (cur === eventVersion) return true;
  log.debug('applySync', 'version changed during fetch — skip merge', { eventVersion });
  return false;
}

/**
 * Refetch the addressed node(s) via the INVOKER read RPC and merge into snapshot-store.
 * Runs OUTSIDE React render (realtime callback) → async is safe. Per-scope granularity
 * (Validation Q2):
 *   node       → skip if I hold THAT node's live lock, else set/remove the exact node.
 *   collection → reconcile-by-id (array parent) / whole-replace (object parent, e.g. a
 *                textbox-locale delete); NEVER skip — reconcile keeps my in-progress edits.
 *   set        → whole-replace each target collection; skip if I hold ANY live lock (coarse).
 * fetchSnapshotNode returns undefined (rpc error → leave B untouched) vs null (deleted → remove).
 */
async function applySync(sync: MetadataSync): Promise<void> {
  try {
    switch (sync.scope) {
      case 'node': {
        // Exact granularity: only skip the node I'm actively editing; other peers' nodes merge.
        const target: LockTarget = {
          step: sync.step,
          resource_type: sync.resource_type,
          resource_id: sync.resource_id,
          locale: sync.locale,
        } as LockTarget;
        if (holdsLiveLock(target)) {
          log.debug('applySync', 'node locked-by-me — skip', { rid: sync.resource_id });
          return;
        }
        const value = await fetchSnapshotNode(sync.version, sync.column, sync.path);
        if (value === undefined) return; // rpc error — leave B's view untouched
        if (!versionStillMatches(sync.version)) return;
        withRemotePatchGuard(() =>
          useSnapshotStore.getState().applyRemoteNodePatch(sync.column, sync.path, value), // null → remove
        );
        break;
      }
      case 'collection': {
        // reorder + delete. NO lock-skip — reconcile-by-id keeps B's local object for matching
        // identities (never clobbers an in-progress edit) while adopting server order/membership.
        const node = await fetchSnapshotNode(sync.version, sync.column, sync.path);
        if (node === undefined) return; // rpc error — skip
        if (!versionStillMatches(sync.version)) return;
        if (Array.isArray(node)) {
          withRemotePatchGuard(() =>
            useSnapshotStore.getState().reconcileCollectionByIds(sync.column, sync.path, node),
          );
        } else if (node !== null) {
          // Object parent (textbox-locale delete → `path` addresses the textbox OBJECT / locale map).
          // reconcile-by-id needs an array; whole-replace so the removed locale key is reflected.
          withRemotePatchGuard(() =>
            useSnapshotStore.getState().applyRemoteNodePatch(sync.column, sync.path, node),
          );
        } else {
          // null parent = the whole collection at `path` vanished (rare — structural collections
          // don't disappear on reorder/delete). SKIP: never delete the structural key here, else a
          // selector doing sketch.<collection>.map/.length would crash. null→remove stays node-only.
          log.debug('applySync', 'collection null parent — skip', { column: sync.column });
        }
        break;
      }
      case 'set': {
        // generate summary — whole-replace each target collection. Coarse (replaces the array) →
        // skip if I hold ANY live lock (v1: don't stomp any in-progress edit).
        if (hasAnyLiveLock()) {
          log.debug('applySync', 'set any-lock — skip');
          return;
        }
        for (const t of sync.targets) {
          const arr = await fetchSnapshotNode(sync.version, t.column, t.path);
          // Skip on BOTH rpc-error (undefined) AND null: a generate target is a collection just
          // written, so null is an anomaly — never applyRemoteNodePatch(null) here (would DELETE
          // the structural key sketch.<collection> → selector crash). null→remove is node-only.
          if (arr == null) continue;
          if (!versionStillMatches(sync.version)) return;
          withRemotePatchGuard(() =>
            useSnapshotStore.getState().applyRemoteNodePatch(t.column, t.path, arr),
          );
        }
        break;
      }
    }
  } catch (err) {
    log.error('applySync', 'dispatch failed', {
      scope: sync.scope,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const useContentSyncStore = create<ContentSyncState>()(
  devtools(
    (set, get) => ({
      bookId: null,
      myUserId: null,
      status: 'idle',

      // ── Realtime lifecycle ──────────────────────────────────────────────────
      connect: (bookId) => {
        if (channelHandle && get().bookId === bookId) {
          log.debug('connect', 'already connected — no-op', { bookId });
          return;
        }
        if (channelHandle) {
          log.info('connect', 'book changed — reconnect', { prev: get().bookId, next: bookId });
          get().disconnect();
        }

        const myUserId = useAuthStore.getState().user?.id ?? null;
        if (!myUserId) {
          log.warn('connect', 'no signed-in user — every event will read as peer', { bookId });
        }
        log.info('connect', 'open channel', { bookId, hasUser: !!myUserId });
        set({ bookId, myUserId, status: 'idle' });

        // SYNC-create the channel (no await before it) so disconnect always has a ref.
        channelHandle = openActivityLogChannel({
          bookId,
          onInsert: (row) => get().handleActivityInsert(row),
          onLive: () => set({ status: 'live' }),
          onDown: () => set({ status: 'down' }),
        });
      },

      disconnect: () => {
        log.info('disconnect', 'close store', { bookId: get().bookId });
        if (channelHandle) {
          channelHandle.teardown();
          channelHandle = null;
        }
        set({ bookId: null, myUserId: null, status: 'idle' });
      },

      // ── Internal (channel wiring) ─────────────────────────────────────────────
      handleActivityInsert: (row) => {
        // Realtime callback (outside React render) → async work is safe here, and
        // no set-state-in-effect / ref-in-render rule applies.
        if (!row?.metadata) return; // no metadata → not a content event (login/comment)
        // Self-filter at APPLY time: never refetch/merge our own writes (unlike the
        // lock registry which self-filters at read time).
        if (row.actor_user_id === get().myUserId) {
          log.debug('handleActivityInsert', 'ignore self', { id: row.id });
          return;
        }
        const sync = row.metadata.sync;
        if (!sync) return; // content-less audit row (no sync envelope)

        // Version-guard: only merge into the SAME snapshot version B is viewing (meta.id =
        // snapshots.id — Validation F5). A peer on a different version → skip (no cross-merge).
        // For an active same-book collaborator on this version, a null RPC read is a genuine
        // delete (RLS can't hide a node they can SELECT) → also makes the null→remove path safe.
        const activeVersion = useSnapshotStore.getState().meta.id;
        if (!activeVersion || sync.version !== activeVersion) {
          log.debug('handleActivityInsert', 'version mismatch — skip', {
            scope: sync.scope,
            eventVersion: sync.version,
          });
          return;
        }
        log.debug('handleActivityInsert', 'peer sync event', { scope: sync.scope });

        // Async refetch + merge — safe (realtime callback, outside render). Fire-and-forget:
        // errors are swallowed inside applySync with context; the happy path never awaits.
        void applySync(sync);
      },
    }),
    { name: 'content-sync-store' },
  ),
);

export type { ActivityLogRawRow, MetadataSync, SnapshotColumn } from './types';
export { fetchSnapshotNode } from './rpc';
