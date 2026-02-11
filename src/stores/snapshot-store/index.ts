import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { SnapshotStore } from './types';
import { createDocsSlice, DEFAULT_DOCS } from './slices/docs-slice';
import { createMetaSlice } from './slices/meta-slice';

export const useSnapshotStore = create<SnapshotStore>()(
  devtools(
    subscribeWithSelector(
      immer((...args) => ({
        ...createDocsSlice(...args),
        ...createMetaSlice(...args),

        initSnapshot: (data) => {
          const [set] = args;
          set((state) => {
            state.docs = data.docs ?? DEFAULT_DOCS;
            if (data.meta) {
              Object.assign(state.meta, data.meta);
            }
            state.sync.isDirty = false;
          });
        },

        resetSnapshot: () => {
          const [set] = args;
          set((state) => {
            state.docs = DEFAULT_DOCS;
            state.meta = { id: null, bookId: null, version: null, tag: null };
            state.sync = { isDirty: false, lastSavedAt: null, isSaving: false, error: null };
          });
        },
      }))
    ),
    { name: 'snapshot-store' }
  )
);

// Re-export selectors
export * from './selectors';
export type { SnapshotStore } from './types';
