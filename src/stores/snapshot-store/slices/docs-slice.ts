import type { StateCreator } from 'zustand';
import type { SnapshotStore, DocsSlice } from '../types';
import type { ManuscriptDoc } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'DocsSlice');

export const DEFAULT_DOCS: ManuscriptDoc[] = [
  { type: 'brief', title: 'Brief', content: '' },
  { type: 'draft', title: 'Draft', content: '' },
  { type: 'script', title: 'Script', content: '' },
];

export const createDocsSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  DocsSlice
> = (set, get) => ({
  docs: DEFAULT_DOCS,

  setDocs: (docs) =>
    set((state) => {
      log.debug('setDocs', 'replace all docs', { count: docs.length });
      state.docs = docs;
    }),

  addDoc: (doc) =>
    set((state) => {
      log.debug('addDoc', 'add doc', { type: doc.type, title: doc.title });
      state.docs.push(doc);
      state.sync.isDirty = true;
    }),

  updateDoc: (index, updates) =>
    set((state) => {
      if (state.docs[index]) {
        log.debug('updateDoc', 'update doc', { index, updateKeys: Object.keys(updates) });
        Object.assign(state.docs[index], updates);
        state.sync.isDirty = true;
      }
    }),

  updateDocTitle: (index, title) =>
    set((state) => {
      if (state.docs[index]) {
        log.debug('updateDocTitle', 'update title', { index, title });
        state.docs[index].title = title;
        state.sync.isDirty = true;
      }
    }),

  deleteDoc: (index) =>
    set((state) => {
      // Only allow deleting 'other' type docs
      if (state.docs[index]?.type === 'other') {
        log.debug('deleteDoc', 'delete doc', { index, type: state.docs[index].type });
        state.docs.splice(index, 1);
        state.sync.isDirty = true;
      }
    }),

  getDoc: (docType) => get().docs.find((d) => d.type === docType),
});
