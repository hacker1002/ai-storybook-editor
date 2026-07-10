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
// ADR-044 §Revision 2026-07-10 (SCENE per-spread HELD session): the SCENE space now holds ONE
// per-spread lock (step 2 / rtype 6) and saves the WHOLE scene owned-key sub-tree (SCENE_OWNED_KEYS)
// on release / saveNow. The IN-SPREAD content mutators below (raw_images / raw_textboxes / a
// spread-META edit via updateIllustrationSpread — manuscript / pages / branch_setting / etc.)
// therefore ONLY mutate + dirty; their former per-node fire-and-forget gateway saves
// (`persistSceneImageCollab` / `persistSceneTextboxCollab` / the `persistSpreadCollab(…,3)` edit)
// were REMOVED so the held-session save-on-release is the SINGLE writer for these keys (no
// double-write / lost-write). SPREAD-LEVEL COLLECTION ops — CREATE (action 2), DELETE (action 4),
// REORDER — CANNOT be expressed by a node-scoped release-save (a released deleted node has no node
// to save; a fresh spread may be non-dirty at release; a reorder is cross-node), so they KEEP the
// explicit `persistSpreadCollab(…,2)` / `persistSpreadDeleteCollab` / `persistSpreadReorderCollab`
// path. `revertSceneOwnedSubtree` below is the held-session `onLost` revert (mirror of
// `revertRetouchOwnedSubtree`). NOTE `shapes` is a RETOUCH-owned key — the SCENE space no longer
// writes it through the rtype-6 merge (the sidebar shape-reorder was removed).
import {
  persistSpreadCollab,
  persistSpreadDeleteCollab,
  persistSpreadReorderCollab,
} from './collab-scene-save-helper';
import { SCENE_OWNED_KEYS } from './collab-owned-subtree';

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
    // collab: spread-META edit (manuscript / pages / branch_setting / raw_* array replace) — mutate
    // + dirty only; the SCENE per-spread held session saves the owned sub-tree on release (ADR-044).
    // The former `persistSpreadCollab(get, spreadId, 3)` per-node save was REMOVED (held session is
    // the single writer). `shapes` is no longer passed here (scene sidebar shape-reorder removed).
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
    // collab: in-spread content add — mutate + dirty only; SCENE held session saves raw_images on
    // release (ADR-044). Former `persistSceneImageCollab(…,2)` per-node save REMOVED.
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
    // collab: in-spread content edit — mutate + dirty only; SCENE held session saves raw_images on
    // release (ADR-044). Former `persistSceneImageCollab(…,3)` per-node save REMOVED.
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
    // collab: in-spread child delete — mutate + dirty only; the SCENE held session captures the
    // shortened raw_images array on release (ADR-044). Former per-collection delete save REMOVED.
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
    // collab: in-spread content add — mutate + dirty only; SCENE held session saves raw_textboxes on
    // release (ADR-044). Former `persistSceneTextboxCollab(…,2)` per-node save REMOVED.
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
    // collab: in-spread content edit (locale-scoped or node-level) — mutate + dirty only; SCENE held
    // session saves raw_textboxes on release (ADR-044). Former `persistSceneTextboxCollab(…,3)`
    // per-node save REMOVED.
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
    // collab: in-spread child delete — mutate + dirty only; the SCENE held session captures the
    // shortened raw_textboxes array on release (ADR-044). Former per-collection delete save REMOVED.
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

  // --- Held-session onLost revert (SCENE per-spread held session — ADR-044 §Revision 2026-07-10) ---
  //
  // Mirror of `revertRetouchOwnedSubtree` for the SCENE partition. When the SCENE per-spread lock is
  // LOST mid-edit (heartbeat 409), the held-session `onLost` writes the pre-edit baseline OWNED
  // sub-tree back so my un-saved edits don't linger. `baselineSubtree` = a structuredClone of
  // `extractOwnedSubtree(spread, SCENE_OWNED_KEYS)` captured at acquire. For every SCENE owned key:
  // present in baseline → restore it; absent (undefined at acquire) → delete what I added. RETOUCH
  // keys (disjoint partition) are left untouched.
  revertSceneOwnedSubtree: (spreadId, baselineSubtree) =>
    set((state) => {
      const spread = state.illustration.spreads.find((s) => s.id === spreadId);
      if (!spread) {
        log.warn('revertSceneOwnedSubtree', 'spread not found — skip revert', { spreadId });
        return;
      }
      const base = (baselineSubtree ?? {}) as Record<string, unknown>;
      const target = spread as unknown as Record<string, unknown>;
      for (const key of SCENE_OWNED_KEYS) {
        if (key in base) target[key] = base[key];
        else delete target[key];
      }
      state.sync.isDirty = true;
      log.info('revertSceneOwnedSubtree', 'reverted scene sub-tree to baseline', {
        spreadId,
        keys: Object.keys(base).length,
      });
    }),
});
