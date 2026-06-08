import type { StateCreator } from 'zustand';
import type { SnapshotStore, PropsSlice } from '../types';
import { createLogger } from '@/utils/logger';
import { cascadeRemixName, cascadeRemixDelete } from '../utils/remix-name-resync';

const log = createLogger('Store', 'PropsSlice');

export const createPropsSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  PropsSlice
> = (set) => ({
  props: [],

  setProps: (props) =>
    set((state) => {
      log.debug('setProps', 'replace all', { count: props.length });
      state.props = props;
    }),

  // --- Top-level CRUD ---

  addProp: (prop) =>
    set((state) => {
      log.debug('addProp', 'add', { key: prop.key });
      state.props.push(prop);
      state.sync.isDirty = true;
    }),

  updateProp: (key, updates) => {
    set((state) => {
      const idx = state.props.findIndex((p) => p.key === key);
      if (idx !== -1) {
        log.debug('updateProp', 'update', { key, fields: Object.keys(updates) });
        Object.assign(state.props[idx], updates);
        state.sync.isDirty = true;
      }
    });
    if (typeof updates.name === 'string') {
      cascadeRemixName('prop', key, updates.name);
    }
  },

  deleteProp: (key) => {
    set((state) => {
      log.debug('deleteProp', 'delete', { key });
      state.props = state.props.filter((p) => p.key !== key);
      // Clean up any pending image tasks for this prop
      state.imageTasks = state.imageTasks.filter((t) => !(t.entityType === 'prop' && t.entityKey === key));
      state.sync.isDirty = true;
    });
    cascadeRemixDelete('prop', key);
  },

  reorderProps: (fromIndex, toIndex) =>
    set((state) => {
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex < state.props.length && toIndex < state.props.length) {
        log.debug('reorderProps', 'reorder', { fromIndex, toIndex });
        const [removed] = state.props.splice(fromIndex, 1);
        state.props.splice(toIndex, 0, removed);
        state.sync.isDirty = true;
      }
    }),

  // --- Nested: Variants ---

  addPropVariant: (propKey, propVariant) =>
    set((state) => {
      const prop = state.props.find((p) => p.key === propKey);
      if (prop) {
        log.debug('addPropVariant', 'add', { propKey, variantKey: propVariant.key });
        prop.variants.push(propVariant);
        state.sync.isDirty = true;
      }
    }),

  updatePropVariant: (propKey, variantKey, updates) =>
    set((state) => {
      const prop = state.props.find((p) => p.key === propKey);
      if (prop) {
        const idx = prop.variants.findIndex((s) => s.key === variantKey);
        if (idx !== -1) {
          log.debug('updatePropVariant', 'update', { propKey, variantKey, fields: Object.keys(updates) });
          Object.assign(prop.variants[idx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deletePropVariant: (propKey, variantKey) =>
    set((state) => {
      const prop = state.props.find((p) => p.key === propKey);
      if (prop) {
        log.debug('deletePropVariant', 'delete', { propKey, variantKey });
        prop.variants = prop.variants.filter((s) => s.key !== variantKey);
        // Clean up any pending image tasks for this variant
        state.imageTasks = state.imageTasks.filter(
          (t) => !(t.entityType === 'prop' && t.entityKey === propKey && t.childKey === variantKey)
        );
        state.sync.isDirty = true;
      }
    }),

  // --- Nested: Sounds ---

  addPropSound: (propKey, sound) =>
    set((state) => {
      const prop = state.props.find((p) => p.key === propKey);
      if (prop) {
        log.debug('addPropSound', 'add', { propKey, soundKey: sound.key });
        prop.sounds.push(sound);
        state.sync.isDirty = true;
      }
    }),

  updatePropSound: (propKey, soundKey, updates) =>
    set((state) => {
      const prop = state.props.find((p) => p.key === propKey);
      if (prop) {
        const idx = prop.sounds.findIndex((s) => s.key === soundKey);
        if (idx !== -1) {
          log.debug('updatePropSound', 'update', { propKey, soundKey, fields: Object.keys(updates) });
          Object.assign(prop.sounds[idx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deletePropSound: (propKey, soundKey) =>
    set((state) => {
      const prop = state.props.find((p) => p.key === propKey);
      if (prop) {
        log.debug('deletePropSound', 'delete', { propKey, soundKey });
        prop.sounds = prop.sounds.filter((s) => s.key !== soundKey);
        state.sync.isDirty = true;
      }
    }),
});
