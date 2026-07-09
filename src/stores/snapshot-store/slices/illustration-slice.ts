import type { StateCreator } from 'zustand';
import type { SnapshotStore, IllustrationSlice } from '../types';
import { createLogger } from '@/utils/logger';
import { renumberSpreadPages } from '@/utils/renumber-spread-pages';
import {
  addSectionAction,
  updateSectionAction,
  deleteSectionAction,
  removeBranchesForSections,
  validateSectionRanges,
  setNextSpreadIdAction,
  clearNextSpreadIdAction,
  setBranchSettingAction,
  clearBranchSettingAction,
  addBranchAction,
  updateBranchAction,
  deleteBranchAction,
  reorderBranchesAction,
  updateBranchSettingLocaleAction,
  deleteBranchSettingLocaleAction,
  updateBranchLocaleAction,
  deleteBranchLocaleAction,
} from './illustration-branching-helpers';
import {
  persistSpreadCollab,
  persistSpreadDeleteCollab,
  persistSpreadReorderCollab,
  persistSceneImageCollab,
  persistSceneImageDeleteCollab,
  persistSceneTextboxCollab,
  persistSceneTextboxDeleteCollab,
} from './collab-scene-save-helper';

const log = createLogger('Store', 'IllustrationSlice');

export const createIllustrationSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  IllustrationSlice
> = (set, get) => ({
  illustration: { spreads: [], sections: [] },

  setIllustration: (data) =>
    set((state) => {
      log.debug('setIllustration', 'replace all', { spreadCount: data.spreads.length, sectionCount: data.sections.length });
      state.illustration = data;
    }),

  // --- Spread CRUD ---

  addIllustrationSpread: (spread) => {
    set((state) => {
      log.debug('addIllustrationSpread', 'add', { spreadId: spread.id });
      state.illustration.spreads.push(spread);
      state.sync.isDirty = true;
    });
    // collab: persist the new spread node (create, scope:'node') — no-op solo.
    void persistSpreadCollab(get, spread.id, 2);
  },

  updateIllustrationSpread: (spreadId, updates) => {
    set((state) => {
      const idx = state.illustration.spreads.findIndex((s) => s.id === spreadId);
      if (idx !== -1) {
        log.debug('updateIllustrationSpread', 'update', { spreadId, keys: Object.keys(updates) });
        Object.assign(state.illustration.spreads[idx], updates);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the whole spread node (edit, scope:'node') — no-op solo.
    void persistSpreadCollab(get, spreadId, 3);
  },

  deleteIllustrationSpread: (spreadId) => {
    set((state) => {
      const deletedIndex = state.illustration.spreads.findIndex((s) => s.id === spreadId);
      if (deletedIndex === -1) return;

      log.debug('deleteIllustrationSpread', 'delete', { spreadId });

      // Cascade: clear QuizSlice validation state for quizzes on the deleted spread
      const deletedQuizIds = state.illustration.spreads[deletedIndex].quizzes?.map((q) => q.id) ?? [];
      for (const quizId of deletedQuizIds) {
        delete state.quizValidationErrors[quizId];
      }

      state.illustration.spreads.splice(deletedIndex, 1);

      const spreads = state.illustration.spreads;
      const deletedSectionIds: string[] = [];

      // Adjust section boundaries or delete sections that can't be salvaged
      state.illustration.sections = state.illustration.sections.filter((sec) => {
        const isStart = sec.start_spread_id === spreadId;
        const isEnd = sec.end_spread_id === spreadId;

        if (isStart && isEnd) {
          // Single-spread section — must delete
          log.debug('deleteIllustrationSpread', 'cascade delete single-spread section', { sectionId: sec.id });
          deletedSectionIds.push(sec.id);
          return false;
        }

        if (isStart) {
          // Adjust start to next adjacent spread (now at deletedIndex after splice)
          const nextSpread = spreads[deletedIndex];
          if (nextSpread) {
            log.debug('deleteIllustrationSpread', 'adjust section start', { sectionId: sec.id, newStart: nextSpread.id });
            sec.start_spread_id = nextSpread.id;
            return true;
          }
          log.debug('deleteIllustrationSpread', 'cascade delete section (no adjacent)', { sectionId: sec.id });
          deletedSectionIds.push(sec.id);
          return false;
        }

        if (isEnd) {
          // Adjust end to previous adjacent spread
          const prevSpread = spreads[deletedIndex - 1];
          if (prevSpread) {
            log.debug('deleteIllustrationSpread', 'adjust section end', { sectionId: sec.id, newEnd: prevSpread.id });
            sec.end_spread_id = prevSpread.id;
            return true;
          }
          log.debug('deleteIllustrationSpread', 'cascade delete section (no adjacent)', { sectionId: sec.id });
          deletedSectionIds.push(sec.id);
          return false;
        }

        return true;
      });

      // Cascade: remove branches pointing to deleted sections
      removeBranchesForSections(state, deletedSectionIds);

      // Cascade: clear next_spread_id refs pointing to deleted spread
      for (const spread of state.illustration.spreads) {
        if (spread.next_spread_id === spreadId) {
          delete spread.next_spread_id;
        }
      }

      renumberSpreadPages(state.illustration.spreads);
      state.sync.isDirty = true;
    });
    // collab: persist the removal (delete, scope:'collection') — no-op solo.
    void persistSpreadDeleteCollab(spreadId);
  },

  reorderIllustrationSpreads: (fromIndex, toIndex) => {
    set((state) => {
      const { spreads } = state.illustration;
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex < spreads.length && toIndex < spreads.length) {
        log.debug('reorderIllustrationSpreads', 'reorder', { fromIndex, toIndex });
        const [removed] = spreads.splice(fromIndex, 1);
        spreads.splice(toIndex, 0, removed);

        // Validate section ranges — swap start/end if reorder inverted them
        validateSectionRanges(state);

        renumberSpreadPages(spreads);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the new order (reorder, scope:'collection') — no-op solo. The dragged
    // spread lands at toIndex after the splice (mirror the entity-reorder call-site guard).
    const spreads = get().illustration.spreads;
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex < spreads.length && toIndex < spreads.length && fromIndex !== toIndex) {
      const draggedId = spreads[toIndex]?.id;
      if (draggedId) void persistSpreadReorderCollab(get, draggedId, fromIndex, toIndex);
    }
  },

  // --- Raw Images (illustration phase, player_visible always false) ---

  addRawImage: (spreadId, image) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.raw_images) spread.raw_images = [];
        log.debug('addRawImage', 'add', { spreadId, imageId: image.id });
        spread.raw_images.push(image);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the new raw_image node (create, scope:'node') — no-op solo.
    void persistSceneImageCollab(get, spreadId, image.id, 2);
  },

  updateRawImage: (spreadId, imageId, updates) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.raw_images) {
        const idx = spread.raw_images.findIndex((i) => i.id === imageId);
        if (idx !== -1) {
          log.debug('updateRawImage', 'update', { spreadId, imageId, keys: Object.keys(updates) });
          Object.assign(spread.raw_images[idx], updates);
          state.sync.isDirty = true;
        }
      }
    });
    // collab: persist the whole raw_image node (edit, scope:'node') — no-op solo.
    void persistSceneImageCollab(get, spreadId, imageId, 3);
  },

  deleteRawImage: (spreadId, imageId) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.raw_images) {
        log.debug('deleteRawImage', 'delete', { spreadId, imageId });
        spread.raw_images = spread.raw_images.filter((i) => i.id !== imageId);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the removal (delete, scope:'collection') — no-op solo.
    void persistSceneImageDeleteCollab(spreadId, imageId);
  },

  // --- Raw Textboxes (illustration phase, player_visible always false) ---

  addRawTextbox: (spreadId, textbox) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        if (!spread.raw_textboxes) spread.raw_textboxes = [];
        log.debug('addRawTextbox', 'add', { spreadId, textboxId: textbox.id });
        spread.raw_textboxes.push(textbox);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the new raw_textbox node (create, whole node, scope:'node') — no-op solo.
    void persistSceneTextboxCollab(get, spreadId, textbox.id, 2);
  },

  updateRawTextbox: (spreadId, textboxId, updates) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.raw_textboxes) {
        const idx = spread.raw_textboxes.findIndex((t) => t.id === textboxId);
        if (idx !== -1) {
          log.debug('updateRawTextbox', 'update', { spreadId, textboxId, keys: Object.keys(updates) });
          Object.assign(spread.raw_textboxes[idx], updates);
          state.sync.isDirty = true;
        }
      }
    });
    // collab: persist the edit (locale-scoped `[locale]` sub-object when `updates` carries a
    // language_key, else the whole node; scope:'node') — no-op solo.
    void persistSceneTextboxCollab(get, spreadId, textboxId, 3, updates);
  },

  deleteRawTextbox: (spreadId, textboxId) => {
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.raw_textboxes) {
        log.debug('deleteRawTextbox', 'delete', { spreadId, textboxId });
        spread.raw_textboxes = spread.raw_textboxes.filter((t) => t.id !== textboxId);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the removal (delete, scope:'collection') — no-op solo.
    void persistSceneTextboxDeleteCollab(spreadId, textboxId);
  },

  // --- Clear ---

  clearIllustration: () =>
    set((state) => {
      log.debug('clearIllustration', 'clear');
      state.illustration = { spreads: [], sections: [] };
      state.sync.isDirty = true;
    }),

  // --- Section CRUD (delegated to branching helpers) ---

  addSection: (section) => set((state) => addSectionAction(state, section)),
  updateSection: (sectionId, updates) => set((state) => updateSectionAction(state, sectionId, updates)),
  deleteSection: (sectionId) => set((state) => deleteSectionAction(state, sectionId)),

  // --- Navigation ---

  setNextSpreadId: (sectionId, nextSpreadId) => set((state) => setNextSpreadIdAction(state, sectionId, nextSpreadId)),
  clearNextSpreadId: (sectionId) => set((state) => clearNextSpreadIdAction(state, sectionId)),

  // --- Branch Setting ---

  setBranchSetting: (spreadId, setting) => set((state) => setBranchSettingAction(state, spreadId, setting)),
  clearBranchSetting: (spreadId) => set((state) => clearBranchSettingAction(state, spreadId)),

  // --- Branch CRUD ---

  addBranch: (spreadId, branch) => set((state) => addBranchAction(state, spreadId, branch)),
  updateBranch: (spreadId, branchIndex, updates) => set((state) => updateBranchAction(state, spreadId, branchIndex, updates)),
  deleteBranch: (spreadId, branchIndex) => set((state) => deleteBranchAction(state, spreadId, branchIndex)),
  reorderBranches: (spreadId, fromIndex, toIndex) => set((state) => reorderBranchesAction(state, spreadId, fromIndex, toIndex)),

  // --- Localization ---

  updateBranchSettingLocale: (spreadId, languageKey, content) => set((state) => updateBranchSettingLocaleAction(state, spreadId, languageKey, content)),
  deleteBranchSettingLocale: (spreadId, languageKey) => set((state) => deleteBranchSettingLocaleAction(state, spreadId, languageKey)),
  updateBranchLocale: (spreadId, branchIndex, languageKey, content) => set((state) => updateBranchLocaleAction(state, spreadId, branchIndex, languageKey, content)),
  deleteBranchLocale: (spreadId, branchIndex, languageKey) => set((state) => deleteBranchLocaleAction(state, spreadId, branchIndex, languageKey)),
});
