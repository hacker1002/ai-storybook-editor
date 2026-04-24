import type { StateCreator } from 'zustand';
import type { SnapshotStore, CharactersSlice } from '../types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'CharactersSlice');

export const createCharactersSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  CharactersSlice
> = (set) => ({
  characters: [],

  setCharacters: (characters) =>
    set((state) => {
      log.debug('setCharacters', 'replace all', { count: characters.length });
      state.characters = characters;
    }),

  // --- Top-level CRUD ---

  addCharacter: (character) =>
    set((state) => {
      log.debug('addCharacter', 'add', { key: character.key });
      state.characters.push(character);
      state.sync.isDirty = true;
    }),

  updateCharacter: (key, updates) =>
    set((state) => {
      const idx = state.characters.findIndex((c) => c.key === key);
      if (idx !== -1) {
        log.debug('updateCharacter', 'update', { key, fields: Object.keys(updates) });
        Object.assign(state.characters[idx], updates);
        state.sync.isDirty = true;
      }
    }),

  deleteCharacter: (key) =>
    set((state) => {
      log.debug('deleteCharacter', 'delete', { key });
      state.characters = state.characters.filter((c) => c.key !== key);
      state.imageTasks = state.imageTasks.filter((t) => !(t.entityType === 'character' && t.entityKey === key));
      state.sync.isDirty = true;
    }),

  reorderCharacters: (fromIndex, toIndex) =>
    set((state) => {
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex < state.characters.length && toIndex < state.characters.length) {
        log.debug('reorderCharacters', 'reorder', { fromIndex, toIndex });
        const [removed] = state.characters.splice(fromIndex, 1);
        state.characters.splice(toIndex, 0, removed);
        state.sync.isDirty = true;
      }
    }),

  // --- Nested: Variants ---

  addCharacterVariant: (key, variant) =>
    set((state) => {
      const char = state.characters.find((c) => c.key === key);
      if (char) {
        log.debug('addCharacterVariant', 'add', { key, variantKey: variant.key });
        char.variants.push(variant);
        state.sync.isDirty = true;
      }
    }),

  updateCharacterVariant: (key, variantKey, updates) =>
    set((state) => {
      const char = state.characters.find((c) => c.key === key);
      if (char) {
        const idx = char.variants.findIndex((v) => v.key === variantKey);
        if (idx !== -1) {
          log.debug('updateCharacterVariant', 'update', { key, variantKey, fields: Object.keys(updates) });
          Object.assign(char.variants[idx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deleteCharacterVariant: (key, variantKey) =>
    set((state) => {
      const char = state.characters.find((c) => c.key === key);
      if (char) {
        log.debug('deleteCharacterVariant', 'delete', { key, variantKey });
        char.variants = char.variants.filter((v) => v.key !== variantKey);
        state.imageTasks = state.imageTasks.filter(
          (t) => !(t.entityType === 'character' && t.entityKey === key && t.childKey === variantKey)
        );
        state.sync.isDirty = true;
      }
    }),

  // --- Nested: Voice Setting (single-object) ---

  updateCharacterVoiceSetting: (characterKey, next) =>
    set((state) => {
      const char = state.characters.find((c) => c.key === characterKey);
      if (char) {
        log.debug('updateCharacterVoiceSetting', 'replace', {
          characterKey,
          keyCount: Object.keys(next).length,
        });
        char.voice_setting = next;
        state.sync.isDirty = true;
      }
    }),

  // --- Nested: CropSheets (index-based) ---

  addCharacterCropSheet: (key, cropSheet) =>
    set((state) => {
      const char = state.characters.find((c) => c.key === key);
      if (char) {
        log.debug('addCharacterCropSheet', 'add', { key, title: cropSheet.title });
        char.crop_sheets.push(cropSheet);
        state.sync.isDirty = true;
      }
    }),

  updateCharacterCropSheet: (key, cropSheetIndex, updates) =>
    set((state) => {
      const char = state.characters.find((c) => c.key === key);
      if (char && cropSheetIndex >= 0 && cropSheetIndex < char.crop_sheets.length) {
        log.debug('updateCharacterCropSheet', 'update', { key, cropSheetIndex, fields: Object.keys(updates) });
        Object.assign(char.crop_sheets[cropSheetIndex], updates);
        state.sync.isDirty = true;
      }
    }),

  deleteCharacterCropSheet: (key, cropSheetIndex) =>
    set((state) => {
      const char = state.characters.find((c) => c.key === key);
      if (char && cropSheetIndex >= 0 && cropSheetIndex < char.crop_sheets.length) {
        log.debug('deleteCharacterCropSheet', 'delete', { key, cropSheetIndex });
        char.crop_sheets.splice(cropSheetIndex, 1);
        state.sync.isDirty = true;
      }
    }),
});
