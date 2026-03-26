import type { StateCreator } from 'zustand';
import type { SnapshotStore, StagesSlice } from '../types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'StagesSlice');

export const createStagesSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  StagesSlice
> = (set) => ({
  stages: [],

  setStages: (stages) =>
    set((state) => {
      log.debug('setStages', 'replace all', { count: stages.length });
      state.stages = stages;
    }),

  // --- Top-level CRUD ---

  addStage: (stage) =>
    set((state) => {
      log.debug('addStage', 'add', { key: stage.key });
      state.stages.push(stage);
      state.sync.isDirty = true;
    }),

  updateStage: (key, updates) =>
    set((state) => {
      const idx = state.stages.findIndex((s) => s.key === key);
      if (idx !== -1) {
        log.debug('updateStage', 'update', { key, fields: Object.keys(updates) });
        Object.assign(state.stages[idx], updates);
        state.sync.isDirty = true;
      }
    }),

  deleteStage: (key) =>
    set((state) => {
      log.debug('deleteStage', 'delete', { key });
      state.stages = state.stages.filter((s) => s.key !== key);
      state.imageTasks = state.imageTasks.filter((t) => !(t.entityType === 'stage' && t.entityKey === key));
      state.sync.isDirty = true;
    }),

  reorderStages: (fromIndex, toIndex) =>
    set((state) => {
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex < state.stages.length && toIndex < state.stages.length) {
        log.debug('reorderStages', 'reorder', { fromIndex, toIndex });
        const [removed] = state.stages.splice(fromIndex, 1);
        state.stages.splice(toIndex, 0, removed);
        state.sync.isDirty = true;
      }
    }),

  // --- Nested: Settings ---

  addStageSetting: (key, setting) =>
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        log.debug('addStageSetting', 'add', { key, settingKey: setting.key });
        stage.settings.push(setting);
        state.sync.isDirty = true;
      }
    }),

  updateStageSetting: (key, settingKey, updates) =>
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        const idx = stage.settings.findIndex((st) => st.key === settingKey);
        if (idx !== -1) {
          log.debug('updateStageSetting', 'update', { key, settingKey, fields: Object.keys(updates) });
          Object.assign(stage.settings[idx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deleteStageSetting: (key, settingKey) =>
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        log.debug('deleteStageSetting', 'delete', { key, settingKey });
        stage.settings = stage.settings.filter((st) => st.key !== settingKey);
        state.imageTasks = state.imageTasks.filter(
          (t) => !(t.entityType === 'stage' && t.entityKey === key && t.childKey === settingKey)
        );
        state.sync.isDirty = true;
      }
    }),

  // --- Nested: Sounds ---

  addStageSound: (key, sound) =>
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        log.debug('addStageSound', 'add', { key, soundKey: sound.key });
        stage.sounds.push(sound);
        state.sync.isDirty = true;
      }
    }),

  updateStageSound: (key, soundKey, updates) =>
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
    }),

  deleteStageSound: (key, soundKey) =>
    set((state) => {
      const stage = state.stages.find((s) => s.key === key);
      if (stage) {
        log.debug('deleteStageSound', 'delete', { key, soundKey });
        stage.sounds = stage.sounds.filter((sd) => sd.key !== soundKey);
        state.sync.isDirty = true;
      }
    }),
});
