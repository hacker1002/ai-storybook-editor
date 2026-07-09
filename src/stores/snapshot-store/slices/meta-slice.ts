import type { StateCreator } from 'zustand';
import type { SnapshotStore, MetaSlice, SnapshotColumn } from '../types';
import { createLogger } from '@/utils/logger';
import { setNodeAtPath, getNodeAtPath } from '../utils/deep-set-node';

const log = createLogger('Store', 'MetaSlice');

const DEFAULT_META = {
  id: null,
  bookId: null,
  version: null,
  tag: null,
  autoSaveId: null,
};

const DEFAULT_SYNC = {
  isDirty: false,
  lastSavedAt: null,
  lastManualSavedAt: null,
  isSaving: false,
  isAutoSaving: false,
  error: null,
};

export const createMetaSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  MetaSlice
> = (set) => ({
  meta: DEFAULT_META,
  sync: DEFAULT_SYNC,

  setMeta: (meta) =>
    set((state) => {
      log.debug('setMeta', 'update meta', { id: meta.id, bookId: meta.bookId, version: meta.version });
      state.meta = meta;
    }),

  markDirty: () =>
    set((state) => {
      log.debug('markDirty', 'mark dirty');
      state.sync.isDirty = true;
    }),

  markClean: () =>
    set((state) => {
      log.debug('markClean', 'mark clean');
      state.sync.isDirty = false;
      state.sync.lastSavedAt = new Date();
    }),

  setSaving: (isSaving) =>
    set((state) => {
      log.debug('setSaving', 'update saving state', { isSaving });
      state.sync.isSaving = isSaving;
    }),

  setSaveError: (error) =>
    set((state) => {
      log.debug('setSaveError', 'update save error', { hasError: !!error });
      state.sync.error = error;
    }),

  // --- Collab content-sync merge (phase 04) — NEVER set sync.isDirty ---
  // (mirrors the setCharacters/setIllustration "replace without dirty" precedent so a
  //  merge from a peer cannot re-arm the owner-direct autoSave clobber path — ADR-043).

  applyRemoteNodePatch: (column: SnapshotColumn, path: string[], value: unknown) =>
    set((state) => {
      // Guard against clobbering the whole column when the server sent no positional path.
      if (path.length === 0) {
        log.warn('applyRemoteNodePatch', 'empty path — skip (whole-column guard)', { column });
        return;
      }
      const root = state[column];
      if (root == null) {
        log.warn('applyRemoteNodePatch', 'column absent — skip', { column });
        return;
      }
      const res = setNodeAtPath(root, path, value);
      // NOTE: never log `value` — may be a large image / base64 node. Metadata only.
      if (!res.ok) {
        log.debug('applyRemoteNodePatch', 'no-op', { column, pathLen: path.length, reason: res.reason });
      } else {
        log.debug('applyRemoteNodePatch', 'applied', { column, pathLen: path.length, removed: !!res.removed });
      }
      // Intentionally do NOT set state.sync.isDirty (see block comment above).
    }),

  reconcileCollectionByIds: (column: SnapshotColumn, path: string[], fetchedArray: unknown[]) =>
    set((state) => {
      // Collection-scope reconcile (reorder / delete). Handles BOTH nested collections
      // (path=['spreads'] under `illustration`/`sketch`) AND bare-array TOP-LEVEL columns
      // (characters / props / stages, path=[]). For a bare-array column, setNodeAtPath refuses
      // the empty path (its whole-column clobber guard protects node-scope writes), so the
      // whole-column replace is applied DIRECTLY below — the ONE legitimate whole-column write.
      // Node-scope writes STAY guarded in applyRemoteNodePatch (its empty-path guard is intact);
      // only this collection-scope reconcile may replace a whole bare-array column (P04b fix).
      const arr = getNodeAtPath(state[column], path);
      if (!Array.isArray(arr) || !Array.isArray(fetchedArray)) {
        log.debug('reconcileCollectionByIds', 'no-op (not array)', { column, pathLen: path.length });
        return;
      }
      // Adopt the server's order + membership, but KEEP the local element object for any
      // matching identity (preserves a peer's in-progress edit — collection scope carries
      // only order/membership; content edits arrive separately via applyRemoteNodePatch).
      // Identity = `id ?? key`: spreads/images are `id`-keyed, entities
      // (characters/props/stages) are `key`-keyed. Elements with NO identity fall back to the
      // fetched object (never collapse onto one Map slot → avoids duplicate/dropped corruption).
      const identityOf = (el: unknown): unknown => {
        const o = el as { id?: unknown; key?: unknown } | null;
        return o?.id ?? o?.key;
      };
      const localByIdentity = new Map<unknown, unknown>();
      for (const el of arr) {
        const idty = identityOf(el);
        if (idty != null) localByIdentity.set(idty, el);
      }
      const reconciled = fetchedArray.map((el) => {
        const idty = identityOf(el);
        return (idty != null ? localByIdentity.get(idty) : undefined) ?? el;
      });

      if (path.length === 0) {
        // Bare-array top-level column (characters / props / stages) — replace the whole
        // column directly (immer-tracked draft assign), identity-preserving. This is the
        // collection-scope-only path; node-scope whole-column writes remain refused.
        (state as Record<string, unknown>)[column] = reconciled;
        log.debug('reconcileCollectionByIds', 'reconciled (bare column)', {
          column,
          localCount: arr.length,
          fetchedCount: fetchedArray.length,
        });
        return;
      }

      const res = setNodeAtPath(state[column], path, reconciled);
      log.debug('reconcileCollectionByIds', res.ok ? 'reconciled' : 'no-op', {
        column,
        pathLen: path.length,
        localCount: arr.length,
        fetchedCount: fetchedArray.length,
        reason: res.ok ? undefined : res.reason,
      });
      // Intentionally do NOT set state.sync.isDirty.
    }),
});
