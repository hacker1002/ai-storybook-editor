import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { SnapshotStore } from './types';
import { createDocsSlice, DEFAULT_DOCS } from './slices/docs-slice';
import { createMetaSlice } from './slices/meta-slice';
import { createDummiesSlice } from './slices/dummies-slice';
import { createIllustrationSlice } from './slices/illustration-slice';
import { createRetouchSlice } from './slices/retouch-slice';
import { createPropsSlice } from './slices/props-slice';
import { createCharactersSlice } from './slices/characters-slice';
import { createStagesSlice } from './slices/stages-slice';
import { createImageTaskSlice } from './slices/image-task-slice';

const log = createLogger('Store', 'SnapshotStore');

export const useSnapshotStore = create<SnapshotStore>()(
  devtools(
    subscribeWithSelector(
      immer((...args) => ({
        ...createDocsSlice(...args),
        ...createMetaSlice(...args),
        ...createDummiesSlice(...args),
        ...createIllustrationSlice(...args),
        ...createRetouchSlice(...args),
        ...createPropsSlice(...args),
        ...createCharactersSlice(...args),
        ...createStagesSlice(...args),
        ...createImageTaskSlice(...args),

        // Fetch state
        fetchLoading: false,
        fetchError: null,

        fetchSnapshot: async (bookId: string) => {
          const [set] = args;
          log.info('fetchSnapshot', 'start', { bookId });
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
            log.error('fetchSnapshot', 'failed', { bookId, error });
            set((state) => {
              state.fetchLoading = false;
              state.fetchError = 'Không thể tải snapshot';
            });
            return;
          }

          log.info('fetchSnapshot', 'done', { bookId, hasData: !!data, snapshotId: data?.id });
          set((state) => {
            if (data) {
              state.meta.id = data.id;
              state.meta.bookId = data.book_id;
              state.meta.version = data.version;
              state.meta.tag = data.tag;
              state.docs = data.docs?.length ? data.docs : DEFAULT_DOCS;
              state.dummies = data.dummies ?? [];
              state.illustration = data.illustration ?? { spreads: [] };
              state.retouch = data.retouch ?? { spreads: [] };
              state.props = data.props ?? [];
              state.characters = data.characters ?? [];
              state.stages = data.stages ?? [];
            } else {
              state.meta.bookId = bookId;
              state.docs = DEFAULT_DOCS;
              state.dummies = [];
              state.illustration = { spreads: [] };
              state.retouch = { spreads: [] };
              state.props = [];
              state.characters = [];
              state.stages = [];
            }
            state.fetchLoading = false;
            state.sync.isDirty = false;
          });
        },

        saveSnapshot: async () => {
          const [set, get] = args;
          const { meta, docs, dummies, illustration, retouch, props, characters, stages, sync } = get();

          if (!meta.bookId || sync.isSaving) return;

          log.info('saveSnapshot', 'start', { bookId: meta.bookId, snapshotId: meta.id, docCount: docs.length, dummyCount: dummies.length, illustrationSpreadCount: illustration.spreads.length, retouchSpreadCount: retouch.spreads.length, propCount: props.length, characterCount: characters.length, stageCount: stages.length });
          set((state) => {
            state.sync.isSaving = true;
            state.sync.error = null;
          });

          const now = new Date();
          const version = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

          const snapshotData = {
            book_id: meta.bookId,
            docs,
            dummies,
            illustration,
            retouch,
            props,
            characters,
            stages,
            version,
            save_type: 1, // manual save
          };

          let result;
          if (meta.id) {
            result = await supabase
              .from('snapshots')
              .update({ docs, dummies, illustration, retouch, props, characters, stages, version })
              .eq('id', meta.id)
              .select()
              .single();
          } else {
            result = await supabase
              .from('snapshots')
              .insert(snapshotData)
              .select()
              .single();
          }

          if (result.error) {
            log.error('saveSnapshot', 'failed', { bookId: meta.bookId, error: result.error });
            set((state) => {
              state.sync.isSaving = false;
              state.sync.error = 'Không thể lưu snapshot';
            });
            return;
          }

          log.info('saveSnapshot', 'done', { bookId: meta.bookId, snapshotId: result.data.id, version });
          set((state) => {
            state.meta.id = result.data.id;
            state.meta.version = result.data.version;
            state.sync.isSaving = false;
            state.sync.isDirty = false;
            state.sync.lastSavedAt = now;
          });
        },

        initSnapshot: (data) => {
          const [set] = args;
          log.info('initSnapshot', 'init', { hasData: !!data, hasMeta: !!data.meta });
          set((state) => {
            state.docs = data.docs ?? DEFAULT_DOCS;
            state.dummies = data.dummies ?? [];
            state.illustration = data.illustration ?? { spreads: [] };
            state.retouch = data.retouch ?? { spreads: [] };
            state.props = data.props ?? [];
            state.characters = data.characters ?? [];
            state.stages = data.stages ?? [];
            if (data.meta) {
              Object.assign(state.meta, data.meta);
            }
            state.sync.isDirty = false;
          });
        },

        resetSnapshot: () => {
          const [set] = args;
          log.info('resetSnapshot', 'reset');
          set((state) => {
            state.docs = DEFAULT_DOCS;
            state.dummies = [];
            state.illustration = { spreads: [] };
            state.retouch = { spreads: [] };
            state.props = [];
            state.characters = [];
            state.stages = [];
            state.imageTasks = [];
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
