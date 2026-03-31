import type { StateCreator } from 'zustand';
import type { SnapshotStore, IllustrationSlice } from '../types';
import { createLogger } from '@/utils/logger';
import {
  addSectionAction,
  updateSectionAction,
  deleteSectionAction,
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

const log = createLogger('Store', 'IllustrationSlice');

export const createIllustrationSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  IllustrationSlice
> = (set) => ({
  illustration: { spreads: [], sections: [] },

  setIllustration: (data) =>
    set((state) => {
      log.debug('setIllustration', 'replace all', { spreadCount: data.spreads.length, sectionCount: data.sections.length });
      state.illustration = data;
    }),

  // --- Spread CRUD ---

  addIllustrationSpread: (spread) =>
    set((state) => {
      log.debug('addIllustrationSpread', 'add', { spreadId: spread.id });
      state.illustration.spreads.push(spread);
      state.sync.isDirty = true;
    }),

  updateIllustrationSpread: (spreadId, updates) =>
    set((state) => {
      const idx = state.illustration.spreads.findIndex((s) => s.id === spreadId);
      if (idx !== -1) {
        log.debug('updateIllustrationSpread', 'update', { spreadId, keys: Object.keys(updates) });
        Object.assign(state.illustration.spreads[idx], updates);
        state.sync.isDirty = true;
      }
    }),

  deleteIllustrationSpread: (spreadId) =>
    set((state) => {
      log.debug('deleteIllustrationSpread', 'delete', { spreadId });
      state.illustration.spreads = state.illustration.spreads.filter((s) => s.id !== spreadId);

      // Cascade: remove sections referencing this spread
      state.illustration.sections = state.illustration.sections.filter(
        (sec) => sec.start_spread_id !== spreadId && sec.end_spread_id !== spreadId
      );

      // Cascade: clear next_spread_id refs pointing to deleted spread
      for (const spread of state.illustration.spreads) {
        if (spread.next_spread_id === spreadId) {
          delete spread.next_spread_id;
        }
      }

      state.sync.isDirty = true;
    }),

  reorderIllustrationSpreads: (fromIndex, toIndex) =>
    set((state) => {
      const { spreads } = state.illustration;
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex < spreads.length && toIndex < spreads.length) {
        log.debug('reorderIllustrationSpreads', 'reorder', { fromIndex, toIndex });
        const [removed] = spreads.splice(fromIndex, 1);
        spreads.splice(toIndex, 0, removed);
        state.sync.isDirty = true;
      }
    }),

  // --- Images ---

  addIllustrationImage: (spreadId, image) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addIllustrationImage', 'add', { spreadId, imageId: image.id });
        spread.images.push(image);
        state.sync.isDirty = true;
      }
    }),

  updateIllustrationImage: (spreadId, imageId, updates) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        const idx = spread.images.findIndex((i) => i.id === imageId);
        if (idx !== -1) {
          log.debug('updateIllustrationImage', 'update', { spreadId, imageId, keys: Object.keys(updates) });
          Object.assign(spread.images[idx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deleteIllustrationImage: (spreadId, imageId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('deleteIllustrationImage', 'delete', { spreadId, imageId });
        spread.images = spread.images.filter((i) => i.id !== imageId);
        state.sync.isDirty = true;
      }
    }),

  // --- Textboxes ---

  addIllustrationTextbox: (spreadId, textbox) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addIllustrationTextbox', 'add', { spreadId, textboxId: textbox.id });
        spread.textboxes.push(textbox);
        state.sync.isDirty = true;
      }
    }),

  updateIllustrationTextbox: (spreadId, textboxId, updates) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        const idx = spread.textboxes.findIndex((t) => t.id === textboxId);
        if (idx !== -1) {
          log.debug('updateIllustrationTextbox', 'update', { spreadId, textboxId, keys: Object.keys(updates) });
          Object.assign(spread.textboxes[idx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deleteIllustrationTextbox: (spreadId, textboxId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('deleteIllustrationTextbox', 'delete', { spreadId, textboxId });
        spread.textboxes = spread.textboxes.filter((t) => t.id !== textboxId);
        state.sync.isDirty = true;
      }
    }),

  // --- Shapes ---

  addIllustrationShape: (spreadId, shape) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread) {
        log.debug('addIllustrationShape', 'add', { spreadId, shapeId: shape.id });
        if (!spread.shapes) spread.shapes = [];
        spread.shapes.push(shape);
        state.sync.isDirty = true;
      }
    }),

  updateIllustrationShape: (spreadId, shapeId, updates) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.shapes) {
        const idx = spread.shapes.findIndex((sh) => sh.id === shapeId);
        if (idx !== -1) {
          log.debug('updateIllustrationShape', 'update', { spreadId, shapeId, keys: Object.keys(updates) });
          Object.assign(spread.shapes[idx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deleteIllustrationShape: (spreadId, shapeId) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (spread?.shapes) {
        log.debug('deleteIllustrationShape', 'delete', { spreadId, shapeId });
        spread.shapes = spread.shapes.filter((sh) => sh.id !== shapeId);
        state.sync.isDirty = true;
      }
    }),

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

  setNextSpreadId: (spreadId, nextSpreadId) => set((state) => setNextSpreadIdAction(state, spreadId, nextSpreadId)),
  clearNextSpreadId: (spreadId) => set((state) => clearNextSpreadIdAction(state, spreadId)),

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
