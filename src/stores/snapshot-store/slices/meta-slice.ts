import type { StateCreator } from 'zustand';
import type { SnapshotStore, MetaSlice } from '../types';

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
      state.meta = meta;
    }),

  markDirty: () =>
    set((state) => {
      state.sync.isDirty = true;
    }),

  markClean: () =>
    set((state) => {
      state.sync.isDirty = false;
      state.sync.lastSavedAt = new Date();
    }),

  setSaving: (isSaving) =>
    set((state) => {
      state.sync.isSaving = isSaving;
    }),

  setSaveError: (error) =>
    set((state) => {
      state.sync.error = error;
    }),
});
