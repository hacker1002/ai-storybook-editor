import type { StateCreator } from 'zustand';
import type { SnapshotStore, SpreadSettingSlice } from '../types';
import { DEFAULT_SPREAD_SETTING } from '@/types/spread-setting-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SpreadSettingSlice');

/** Find spread navigation entry index, return -1 if not found */
function findSpreadIdx(state: SnapshotStore, spreadId: string): number {
  return state.spreadSetting.spreads.findIndex((s) => s.id === spreadId);
}

/** Get or create spread navigation entry (auto-insert if missing) */
function ensureSpreadNav(state: SnapshotStore, spreadId: string) {
  let idx = findSpreadIdx(state, spreadId);
  if (idx === -1) {
    state.spreadSetting.spreads.push({ id: spreadId });
    idx = state.spreadSetting.spreads.length - 1;
  }
  return state.spreadSetting.spreads[idx];
}

/** Remove spread navigation entry if it has no meaningful data */
function cleanupSpreadNav(state: SnapshotStore, spreadId: string) {
  const idx = findSpreadIdx(state, spreadId);
  if (idx === -1) return;
  const nav = state.spreadSetting.spreads[idx];
  const hasBranch = nav.branch_setting && nav.branch_setting.branches.length > 0;
  const hasNext = nav.next_spread_id != null;
  if (!hasBranch && !hasNext) {
    state.spreadSetting.spreads.splice(idx, 1);
  }
}

export const createSpreadSettingSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  SpreadSettingSlice
> = (set) => ({
  spreadSetting: { ...DEFAULT_SPREAD_SETTING },

  // --- Top-level ---

  setSpreadSetting: (setting) =>
    set((state) => {
      log.debug('setSpreadSetting', 'replace', { spreadCount: setting.spreads.length, sectionCount: setting.sections.length });
      state.spreadSetting = setting;
    }),

  resetSpreadSetting: () =>
    set((state) => {
      log.debug('resetSpreadSetting', 'reset');
      state.spreadSetting = { spreads: [], sections: [] };
      state.sync.isDirty = true;
    }),

  // --- Section CRUD ---

  addSection: (section) =>
    set((state) => {
      log.debug('addSection', 'add', { id: section.id, title: section.title });
      state.spreadSetting.sections.push(section);
      state.sync.isDirty = true;
    }),

  updateSection: (sectionId, updates) =>
    set((state) => {
      const idx = state.spreadSetting.sections.findIndex((s) => s.id === sectionId);
      if (idx !== -1) {
        log.debug('updateSection', 'update', { sectionId, fields: Object.keys(updates) });
        Object.assign(state.spreadSetting.sections[idx], updates);
        state.sync.isDirty = true;
      }
    }),

  deleteSection: (sectionId) =>
    set((state) => {
      log.debug('deleteSection', 'delete', { sectionId });
      state.spreadSetting.sections = state.spreadSetting.sections.filter((s) => s.id !== sectionId);

      // Cascade: remove branches referencing this section
      for (const nav of state.spreadSetting.spreads) {
        if (nav.branch_setting) {
          nav.branch_setting.branches = nav.branch_setting.branches.filter(
            (b) => b.section_id !== sectionId
          );
        }
      }

      // Cleanup empty spread navigations
      state.spreadSetting.spreads = state.spreadSetting.spreads.filter((nav) => {
        const hasBranch = nav.branch_setting && nav.branch_setting.branches.length > 0;
        const hasNext = nav.next_spread_id != null;
        return hasBranch || hasNext;
      });

      state.sync.isDirty = true;
    }),

  // --- Spread navigation CRUD ---

  setSpreadNavigation: (spreadId, nav) =>
    set((state) => {
      log.debug('setSpreadNavigation', 'set', { spreadId });
      const idx = findSpreadIdx(state, spreadId);
      if (idx !== -1) {
        Object.assign(state.spreadSetting.spreads[idx], nav);
      } else {
        state.spreadSetting.spreads.push({ id: spreadId, ...nav });
      }
      state.sync.isDirty = true;
    }),

  removeSpreadNavigation: (spreadId) =>
    set((state) => {
      log.debug('removeSpreadNavigation', 'remove', { spreadId });
      state.spreadSetting.spreads = state.spreadSetting.spreads.filter((s) => s.id !== spreadId);
      state.sync.isDirty = true;
    }),

  // --- next_spread_id ---

  setNextSpreadId: (spreadId, nextSpreadId) =>
    set((state) => {
      log.debug('setNextSpreadId', 'set', { spreadId, nextSpreadId });
      const nav = ensureSpreadNav(state, spreadId);
      nav.next_spread_id = nextSpreadId;
      state.sync.isDirty = true;
    }),

  clearNextSpreadId: (spreadId) =>
    set((state) => {
      log.debug('clearNextSpreadId', 'clear', { spreadId });
      const idx = findSpreadIdx(state, spreadId);
      if (idx !== -1) {
        delete state.spreadSetting.spreads[idx].next_spread_id;
        cleanupSpreadNav(state, spreadId);
      }
      state.sync.isDirty = true;
    }),

  // --- Branch setting ---

  setBranchSetting: (spreadId, setting) =>
    set((state) => {
      log.debug('setBranchSetting', 'set', { spreadId, branchCount: setting.branches.length });
      const nav = ensureSpreadNav(state, spreadId);
      nav.branch_setting = setting;
      state.sync.isDirty = true;
    }),

  clearBranchSetting: (spreadId) =>
    set((state) => {
      log.debug('clearBranchSetting', 'clear', { spreadId });
      const idx = findSpreadIdx(state, spreadId);
      if (idx !== -1) {
        delete state.spreadSetting.spreads[idx].branch_setting;
        cleanupSpreadNav(state, spreadId);
      }
      state.sync.isDirty = true;
    }),

  // --- Branch CRUD ---

  addBranch: (spreadId, branch) =>
    set((state) => {
      log.debug('addBranch', 'add', { spreadId, sectionId: branch.section_id });
      const nav = ensureSpreadNav(state, spreadId);
      if (!nav.branch_setting) {
        nav.branch_setting = { branches: [] };
      }
      nav.branch_setting.branches.push(branch);
      state.sync.isDirty = true;
    }),

  updateBranch: (spreadId, branchIndex, updates) =>
    set((state) => {
      const idx = findSpreadIdx(state, spreadId);
      if (idx !== -1) {
        const branches = state.spreadSetting.spreads[idx].branch_setting?.branches;
        if (branches && branchIndex >= 0 && branchIndex < branches.length) {
          log.debug('updateBranch', 'update', { spreadId, branchIndex, fields: Object.keys(updates) });
          Object.assign(branches[branchIndex], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deleteBranch: (spreadId, branchIndex) =>
    set((state) => {
      const idx = findSpreadIdx(state, spreadId);
      if (idx !== -1) {
        const bs = state.spreadSetting.spreads[idx].branch_setting;
        if (bs && branchIndex >= 0 && branchIndex < bs.branches.length) {
          log.debug('deleteBranch', 'delete', { spreadId, branchIndex });
          bs.branches.splice(branchIndex, 1);
          cleanupSpreadNav(state, spreadId);
          state.sync.isDirty = true;
        }
      }
    }),

  reorderBranches: (spreadId, fromIndex, toIndex) =>
    set((state) => {
      const idx = findSpreadIdx(state, spreadId);
      if (idx !== -1) {
        const branches = state.spreadSetting.spreads[idx].branch_setting?.branches;
        if (branches && fromIndex >= 0 && toIndex >= 0 && fromIndex < branches.length && toIndex < branches.length) {
          log.debug('reorderBranches', 'reorder', { spreadId, fromIndex, toIndex });
          const [removed] = branches.splice(fromIndex, 1);
          branches.splice(toIndex, 0, removed);
          state.sync.isDirty = true;
        }
      }
    }),

  // --- Localization ---

  updateBranchSettingLocale: (spreadId, languageKey, content) =>
    set((state) => {
      const nav = ensureSpreadNav(state, spreadId);
      if (!nav.branch_setting) {
        nav.branch_setting = { branches: [] };
      }
      log.debug('updateBranchSettingLocale', 'update', { spreadId, languageKey });
      (nav.branch_setting as Record<string, unknown>)[languageKey] = content;
      state.sync.isDirty = true;
    }),

  deleteBranchSettingLocale: (spreadId, languageKey) =>
    set((state) => {
      const idx = findSpreadIdx(state, spreadId);
      if (idx !== -1 && state.spreadSetting.spreads[idx].branch_setting) {
        log.debug('deleteBranchSettingLocale', 'delete', { spreadId, languageKey });
        delete (state.spreadSetting.spreads[idx].branch_setting as Record<string, unknown>)[languageKey];
        state.sync.isDirty = true;
      }
    }),

  updateBranchLocale: (spreadId, branchIndex, languageKey, content) =>
    set((state) => {
      const idx = findSpreadIdx(state, spreadId);
      if (idx !== -1) {
        const branches = state.spreadSetting.spreads[idx].branch_setting?.branches;
        if (branches && branchIndex >= 0 && branchIndex < branches.length) {
          log.debug('updateBranchLocale', 'update', { spreadId, branchIndex, languageKey });
          (branches[branchIndex] as Record<string, unknown>)[languageKey] = content;
          state.sync.isDirty = true;
        }
      }
    }),

  deleteBranchLocale: (spreadId, branchIndex, languageKey) =>
    set((state) => {
      const idx = findSpreadIdx(state, spreadId);
      if (idx !== -1) {
        const branches = state.spreadSetting.spreads[idx].branch_setting?.branches;
        if (branches && branchIndex >= 0 && branchIndex < branches.length) {
          log.debug('deleteBranchLocale', 'delete', { spreadId, branchIndex, languageKey });
          delete (branches[branchIndex] as Record<string, unknown>)[languageKey];
          state.sync.isDirty = true;
        }
      }
    }),
});
