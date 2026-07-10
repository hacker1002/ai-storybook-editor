import type { StateCreator } from 'zustand';
import type { SnapshotStore, StagesSlice } from '../types';
import { createLogger } from '@/utils/logger';
// ADR-044 §Revision 2026-07-10 (per-entity HELD session): create/edit/delete mutators mutate +
// dirty only — the entity held session saves the WHOLE stage node on lock release. Only the
// cross-entity REORDER stays on its own `persistEntityReorderCollab` path (out of held-session/undo
// scope). See characters-slice.ts for the shared `revertEntityNode` onLost revert.
// CREATE + DELETE are collection-level ops (a node-scoped release-save can't express them) → they
// KEEP the explicit persistEntityCollab(action 2)/persistEntityDeleteCollab(action 4) path; only
// EDIT moves to the held session.
import {
  persistEntityCollab,
  persistEntityDeleteCollab,
  persistEntityReorderCollab,
} from './collab-entity-save-helper';

const log = createLogger('Store', 'StagesSlice');

export const createStagesSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  StagesSlice
> = (set, get) => ({
  stages: [],

  setStages: (stages) =>
    set((state) => {
      log.debug('setStages', 'replace all', { count: stages.length });
      state.stages = stages;
    }),

  // --- Top-level CRUD ---

  addStage: (stage) => {
    set((state) => {
      log.debug('addStage', 'add', { key: stage.key });
      state.stages.push(stage);
      state.sync.isDirty = true;
    });
    // collab: CREATE is a collection add → explicit save (action 2); held session covers later edits.
    void persistEntityCollab(get, 'stage', stage.key, 2);
  },

  updateStage: (key, updates) => {
    set((state) => {
      const idx = state.stages.findIndex((s) => s.key === key);
      if (idx !== -1) {
        log.debug('updateStage', 'update', { key, fields: Object.keys(updates) });
        Object.assign(state.stages[idx], updates);
        state.sync.isDirty = true;
      }
    });
    // collab: mutate + dirty only — held session saves the whole node on release.
  },

  deleteStage: (key) => {
    set((state) => {
      log.debug('deleteStage', 'delete', { key });
      state.stages = state.stages.filter((s) => s.key !== key);
      state.imageTasks = state.imageTasks.filter((t) => !(t.entityType === 'stage' && t.entityKey === key));
      state.sync.isDirty = true;
    });
    // collab: DELETE is a collection remove → explicit save (action 4); held session skips its
    // node-save on the now-null node (null-node guard).
    void persistEntityDeleteCollab('stage', key);
  },

  reorderStages: (fromIndex, toIndex) => {
    set((state) => {
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex < state.stages.length && toIndex < state.stages.length) {
        log.debug('reorderStages', 'reorder', { fromIndex, toIndex });
        const [removed] = state.stages.splice(fromIndex, 1);
        state.stages.splice(toIndex, 0, removed);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the new order (reorder, scope:'collection') — no-op solo. KEPT on its own path
    // (cross-entity reorder is out of the held-session/undo scope).
    const stages = get().stages;
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex < stages.length && toIndex < stages.length && fromIndex !== toIndex) {
      const draggedKey = stages[toIndex]?.key;
      if (draggedKey) void persistEntityReorderCollab(get, 'stage', draggedKey, fromIndex, toIndex);
    }
  },

  // --- Nested: Variants ---

  addStageVariant: (key, variant) => {
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        log.debug('addStageVariant', 'add', { key, variantKey: variant.key });
        stage.variants.push(variant);
        state.sync.isDirty = true;
      }
    });
    // collab: within-node edit — held session saves the whole entity node on release.
  },

  updateStageVariant: (key, variantKey, updates) => {
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        const idx = stage.variants.findIndex((st) => st.key === variantKey);
        if (idx !== -1) {
          log.debug('updateStageVariant', 'update', { key, variantKey, fields: Object.keys(updates) });
          Object.assign(stage.variants[idx], updates);
          state.sync.isDirty = true;
        }
      }
    });
    // collab: within-node edit (incl. illustration select+delete, generate/edit write-back) — held
    // session saves the whole entity node on release.
  },

  deleteStageVariant: (key, variantKey) => {
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        log.debug('deleteStageVariant', 'delete', { key, variantKey });
        stage.variants = stage.variants.filter((st) => st.key !== variantKey);
        state.imageTasks = state.imageTasks.filter(
          (t) => !(t.entityType === 'stage' && t.entityKey === key && t.childKey === variantKey)
        );
        state.sync.isDirty = true;
      }
    });
    // collab: within-node edit — held session saves the whole entity node on release.
  },

  // --- Nested: Sounds ---

  addStageSound: (key, sound) => {
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        log.debug('addStageSound', 'add', { key, soundKey: sound.key });
        stage.sounds.push(sound);
        state.sync.isDirty = true;
      }
    });
    // collab: within-node edit — held session saves the whole entity node on release.
  },

  updateStageSound: (key, soundKey, updates) => {
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        const idx = stage.sounds.findIndex((sd) => sd.key === soundKey);
        if (idx !== -1) {
          log.debug('updateStageSound', 'update', { key, soundKey, fields: Object.keys(updates) });
          Object.assign(stage.sounds[idx], updates);
          state.sync.isDirty = true;
        }
      }
    });
    // collab: within-node edit — held session saves the whole entity node on release.
  },

  deleteStageSound: (key, soundKey) => {
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        log.debug('deleteStageSound', 'delete', { key, soundKey });
        stage.sounds = stage.sounds.filter((sd) => sd.key !== soundKey);
        state.sync.isDirty = true;
      }
    });
    // collab: within-node edit — held session saves the whole entity node on release.
  },
});
