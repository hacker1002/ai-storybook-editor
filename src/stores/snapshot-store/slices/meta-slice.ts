import type { StateCreator } from 'zustand';
import type { SnapshotStore, MetaSlice } from '../types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'MetaSlice');

const DEFAULT_META = {
  id: null,
  bookId: null,
  version: null,
  tag: null,
};

const DEFAULT_SYNC = {
  isDirty: false,
  lastSavedAt: null,
  isSaving: false,
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
});
