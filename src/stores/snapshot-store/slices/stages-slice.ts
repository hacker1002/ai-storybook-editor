import type { StateCreator } from 'zustand';
import type { SnapshotStore, StagesSlice } from '../types';
import { createLogger } from '@/utils/logger';
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
    // collab: persist the new entity node (create, scope:'node') — no-op solo.
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
    // collab: persist the whole entity node (edit, scope:'node') — no-op solo.
    void persistEntityCollab(get, 'stage', key, 3);
  },

  deleteStage: (key) => {
    set((state) => {
      log.debug('deleteStage', 'delete', { key });
      state.stages = state.stages.filter((s) => s.key !== key);
      state.imageTasks = state.imageTasks.filter((t) => !(t.entityType === 'stage' && t.entityKey === key));
      state.sync.isDirty = true;
    });
    // collab: persist the removal (delete, scope:'collection') — no-op solo.
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
    // collab: persist the new order (reorder, scope:'collection') — no-op solo.
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
    // collab: variant add stays WITHIN the entity node → whole-node re-patch (scope:'node').
    void persistEntityCollab(get, 'stage', key, 3);
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
    // collab: variant edit (incl. illustration select+delete) stays WITHIN the entity node.
    void persistEntityCollab(get, 'stage', key, 3);
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
    // collab: variant delete stays WITHIN the entity node → whole-node re-patch (scope:'node').
    void persistEntityCollab(get, 'stage', key, 3);
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
    // collab: sound add stays WITHIN the entity node → whole-node re-patch (scope:'node').
    void persistEntityCollab(get, 'stage', key, 3);
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
    // collab: sound edit stays WITHIN the entity node → whole-node re-patch (scope:'node').
    void persistEntityCollab(get, 'stage', key, 3);
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
    // collab: sound delete stays WITHIN the entity node → whole-node re-patch (scope:'node').
    void persistEntityCollab(get, 'stage', key, 3);
  },
});
