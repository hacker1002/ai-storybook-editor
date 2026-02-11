import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { supabase } from '@/lib/supabase';
import type { SnapshotStore } from './types';
import { createDocsSlice, DEFAULT_DOCS } from './slices/docs-slice';
import { createMetaSlice } from './slices/meta-slice';

export const useSnapshotStore = create<SnapshotStore>()(
  devtools(
    subscribeWithSelector(
      immer((...args) => ({
        ...createDocsSlice(...args),
        ...createMetaSlice(...args),

        // Fetch state
        fetchLoading: false,
        fetchError: null,

        fetchSnapshot: async (bookId: string) => {
          const [set] = args;
          set((state) => {
            state.fetchLoading = true;
            state.fetchError = null;
          });

          const { data, error } = await supabase
            .from('snapshots')
            .select('*')
            .eq('book_id', bookId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) {
            set((state) => {
              state.fetchLoading = false;
              state.fetchError = 'Không thể tải snapshot';
            });
            return;
          }

          set((state) => {
            if (data) {
              state.meta.id = data.id;
              state.meta.bookId = data.book_id;
              state.meta.version = data.version;
              state.meta.tag = data.tag;
              state.docs = data.docs?.length ? data.docs : DEFAULT_DOCS;
            } else {
              state.meta.bookId = bookId;
              state.docs = DEFAULT_DOCS;
            }
            state.fetchLoading = false;
            state.sync.isDirty = false;
          });
        },

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
            state.fetchLoading = false;
            state.fetchError = null;
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
