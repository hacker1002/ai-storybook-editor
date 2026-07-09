import type { StateCreator } from 'zustand';
import type { SnapshotStore, CharactersSlice } from '../types';
import { createLogger } from '@/utils/logger';
import { cascadeRemixName, cascadeRemixDelete } from '../utils/remix-name-resync';
import {
  persistEntityCollab,
  persistEntityDeleteCollab,
  persistEntityReorderCollab,
} from './collab-entity-save-helper';

const log = createLogger('Store', 'CharactersSlice');

export const createCharactersSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  CharactersSlice
> = (set, get) => ({
  characters: [],

  setCharacters: (characters) =>
    set((state) => {
      log.debug('setCharacters', 'replace all', { count: characters.length });
      state.characters = characters;
    }),

  // --- Top-level CRUD ---

  addCharacter: (character) => {
    set((state) => {
      log.debug('addCharacter', 'add', { key: character.key });
      state.characters.push(character);
      state.sync.isDirty = true;
    });
    // collab: persist the new entity node (create, scope:'node') — no-op solo.
    void persistEntityCollab(get, 'character', character.key, 2);
  },

  updateCharacter: (key, updates) => {
    set((state) => {
      const idx = state.characters.findIndex((c) => c.key === key);
      if (idx !== -1) {
        log.debug('updateCharacter', 'update', { key, fields: Object.keys(updates) });
        Object.assign(state.characters[idx], updates);
        state.sync.isDirty = true;
      }
    });
    if (typeof updates.name === 'string') {
      cascadeRemixName('character', key, updates.name);
    }
    // collab: persist the whole entity node (edit, scope:'node') — no-op solo. The
    // book.remix cascade above is a SEPARATE persistence path (books table, not suppressed).
    void persistEntityCollab(get, 'character', key, 3);
  },

  deleteCharacter: (key) => {
    set((state) => {
      log.debug('deleteCharacter', 'delete', { key });
      state.characters = state.characters.filter((c) => c.key !== key);
      state.imageTasks = state.imageTasks.filter((t) => !(t.entityType === 'character' && t.entityKey === key));
      state.sync.isDirty = true;
    });
    cascadeRemixDelete('character', key);
    // collab: persist the removal (delete, scope:'collection') — no-op solo.
    void persistEntityDeleteCollab('character', key);
  },

  reorderCharacters: (fromIndex, toIndex) => {
    set((state) => {
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex < state.characters.length && toIndex < state.characters.length) {
        log.debug('reorderCharacters', 'reorder', { fromIndex, toIndex });
        const [removed] = state.characters.splice(fromIndex, 1);
        state.characters.splice(toIndex, 0, removed);
        state.sync.isDirty = true;
      }
    });
    // collab: persist the new order (reorder, scope:'collection') — no-op solo. Read the
    // dragged key from the POST-mutate state; skip true no-ops (out-of-range / same index).
    const chars = get().characters;
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex < chars.length && toIndex < chars.length && fromIndex !== toIndex) {
      const draggedKey = chars[toIndex]?.key;
      if (draggedKey) void persistEntityReorderCollab(get, 'character', draggedKey, fromIndex, toIndex);
    }
  },

  // --- Nested: Variants ---

  addCharacterVariant: (key, variant) => {
    set((state) => {
      const char = state.characters.find((c) => c.key === key);
      if (char) {
        log.debug('addCharacterVariant', 'add', { key, variantKey: variant.key });
        char.variants.push(variant);
        state.sync.isDirty = true;
      }
    });
    // collab: variant add is a WITHIN-node edit → whole entity-node re-patch (scope:'node').
    void persistEntityCollab(get, 'character', key, 3);
  },

  updateCharacterVariant: (key, variantKey, updates) => {
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
    });
    // collab: covers visual_description / rename AND illustration select+delete
    // ({ illustrations }) — all WITHIN the entity node → whole-node re-patch (scope:'node').
    void persistEntityCollab(get, 'character', key, 3);
  },

  deleteCharacterVariant: (key, variantKey) => {
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
    });
    // collab: variant delete stays WITHIN the entity node → whole-node re-patch (scope:'node').
    void persistEntityCollab(get, 'character', key, 3);
  },

  // --- Nested: Voice Setting (single-object) ---

  updateCharacterVoiceSetting: (characterKey, next) => {
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
    });
    // collab: voice_setting lives inside the entity node → whole-node re-patch (scope:'node').
    void persistEntityCollab(get, 'character', characterKey, 3);
  },
});
