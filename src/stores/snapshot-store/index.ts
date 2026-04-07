import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { SnapshotStore } from './types';
import type { BaseSpread } from '@/types/spread-types';

/** Ensure every spread has required arrays so consumers never hit undefined */
function normalizeSpread(s: BaseSpread): BaseSpread {
  return {
    ...s,
    images: s.images ?? [],
    textboxes: s.textboxes ?? [],
    pages: s.pages ?? [],
  };
}
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

          // Step 1: Get current_version from books table
          const { data: bookData, error: bookError } = await supabase
            .from('books')
            .select('current_version')
            .eq('id', bookId)
            .single();

          if (bookError) {
            log.warn('fetchSnapshot', 'could not fetch book current_version, falling back to latest', { bookId, error: bookError });
          }

          const currentVersion = bookData?.current_version ?? null;
          log.debug('fetchSnapshot', 'resolved current_version', { bookId, currentVersion });

          // Step 2: Query snapshot — by current_version if available, else latest by updated_at
          let data = null;
          let fetchError = null;

          if (currentVersion) {
            const result = await supabase
              .from('snapshots')
              .select('*')
              .eq('id', currentVersion)
              .maybeSingle();
            data = result.data;
            fetchError = result.error;
          } else {
            const result = await supabase
              .from('snapshots')
              .select('*')
              .eq('book_id', bookId)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            data = result.data;
            fetchError = result.error;
          }

          if (fetchError) {
            log.error('fetchSnapshot', 'failed', { bookId, error: fetchError });
            set((state) => {
              state.fetchLoading = false;
              state.fetchError = 'Không thể tải snapshot';
            });
            return;
          }

          log.info('fetchSnapshot', 'done', { bookId, hasData: !!data, snapshotId: data?.id, saveType: data?.save_type });
          set((state) => {
            if (data) {
              state.meta.id = data.id;
              state.meta.bookId = data.book_id;
              state.meta.version = data.version;
              state.meta.tag = data.tag;
              state.meta.autoSaveId = data.save_type === 2 ? data.id : null;
              state.docs = data.docs?.length ? data.docs : DEFAULT_DOCS;
              state.dummies = data.dummies ?? [];
              const ill = data.illustration;
              state.illustration = {
                spreads: (ill?.spreads ?? []).map(normalizeSpread),
                sections: ill?.sections ?? [],
              };
              state.props = data.props ?? [];
              state.characters = data.characters ?? [];
              state.stages = data.stages ?? [];
              // Restore save timestamps so deriveSaveStatus reflects the correct initial state
              const snapshotTime = new Date(data.updated_at ?? data.created_at);
              if (data.save_type === 2) {
                // Auto-saved only → user hasn't manually published a version yet
                state.sync.lastSavedAt = snapshotTime;
                state.sync.lastManualSavedAt = null;
              } else {
                // Manual save → treat as fully saved
                state.sync.lastManualSavedAt = snapshotTime;
                state.sync.lastSavedAt = null;
              }
            } else {
              state.meta.bookId = bookId;
              state.meta.autoSaveId = null;
              state.docs = DEFAULT_DOCS;
              state.dummies = [];
              state.illustration = { spreads: [], sections: [] };
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
          const { meta, docs, dummies, illustration, props, characters, stages, sync } = get();

          if (!meta.bookId || sync.isSaving) return;

          log.info('saveSnapshot', 'start', { bookId: meta.bookId, docCount: docs.length, dummyCount: dummies.length, illustrationSpreadCount: illustration.spreads.length, sectionCount: illustration.sections.length, propCount: props.length, characterCount: characters.length, stageCount: stages.length });
          set((state) => {
            state.sync.isSaving = true;
            state.sync.error = null;
          });

          const now = new Date();
          const version = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

          // Always INSERT a new row (manual save = version history)
          const result = await supabase
            .from('snapshots')
            .insert({
              book_id: meta.bookId,
              docs,
              dummies,
              illustration,
              props,
              characters,
              stages,
              version,
              save_type: 1,
            })
            .select()
            .single();

          if (result.error) {
            log.error('saveSnapshot', 'failed', { bookId: meta.bookId, error: result.error });
            set((state) => {
              state.sync.isSaving = false;
              state.sync.error = 'Không thể lưu snapshot';
            });
            return;
          }

          // Update books.current_version — accept eventual consistency on failure
          const { error: updateError } = await supabase
            .from('books')
            .update({ current_version: result.data.id })
            .eq('id', meta.bookId);

          if (updateError) {
            log.warn('saveSnapshot', 'failed to update books.current_version', { bookId: meta.bookId, snapshotId: result.data.id, error: updateError });
          }

          log.info('saveSnapshot', 'done', { bookId: meta.bookId, snapshotId: result.data.id, version });
          set((state) => {
            state.meta.id = result.data.id;
            state.meta.version = result.data.version;
            state.sync.isSaving = false;
            state.sync.isDirty = false;
            state.sync.lastSavedAt = null;       // manual save supersedes auto-save state
            state.sync.lastManualSavedAt = now;
          });
        },

        autoSaveSnapshot: async () => {
          const [set, get] = args;
          const { meta, docs, dummies, illustration, props, characters, stages, sync } = get();

          if (!meta.bookId || sync.isSaving || !sync.isDirty) return;

          log.info('autoSaveSnapshot', 'start', { bookId: meta.bookId, autoSaveId: meta.autoSaveId });
          set((state) => {
            state.sync.isSaving = true;
            state.sync.isAutoSaving = true;
            state.sync.error = null;
          });

          const now = new Date();
          const version = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;

          // Update-first: try UPDATE existing auto-save row, INSERT if none exists.
          // Partial unique index (book_id WHERE save_type=2) prevents duplicate INSERTs on race conditions.
          const payload = { docs, dummies, illustration, props, characters, stages, version };
          const { data: updated } = await supabase
            .from('snapshots')
            .update(payload)
            .eq('book_id', meta.bookId)
            .eq('save_type', 2)
            .select()
            .maybeSingle();

          const result = updated
            ? { data: updated, error: null }
            : await supabase
                .from('snapshots')
                .insert({ book_id: meta.bookId, save_type: 2, ...payload })
                .select()
                .single();

          if (result.error) {
            log.error('autoSaveSnapshot', 'failed', { bookId: meta.bookId, error: result.error });
            set((state) => {
              state.sync.isSaving = false;
              state.sync.isAutoSaving = false;
              state.sync.error = 'Không thể tự động lưu';
            });
            return;
          }

          // Update books.current_version — accept eventual consistency on failure
          const { error: updateError } = await supabase
            .from('books')
            .update({ current_version: result.data.id })
            .eq('id', meta.bookId);

          if (updateError) {
            log.warn('autoSaveSnapshot', 'failed to update books.current_version', { bookId: meta.bookId, snapshotId: result.data.id, error: updateError });
          }

          log.info('autoSaveSnapshot', 'done', { bookId: meta.bookId, snapshotId: result.data.id });
          set((state) => {
            state.meta.id = result.data.id;      // sync with books.current_version updated above
            state.meta.autoSaveId = result.data.id;
            state.sync.isSaving = false;
            state.sync.isAutoSaving = false;
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
            const ill = data.illustration;
            state.illustration = {
              spreads: (ill?.spreads ?? []).map(normalizeSpread),
              sections: ill?.sections ?? [],
            };
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
            state.illustration = { spreads: [], sections: [] };
            state.props = [];
            state.characters = [];
            state.stages = [];
            state.imageTasks = [];
            state.meta = { id: null, bookId: null, version: null, tag: null, autoSaveId: null };
            state.sync = { isDirty: false, lastSavedAt: null, lastManualSavedAt: null, isSaving: false, isAutoSaving: false, error: null };
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
