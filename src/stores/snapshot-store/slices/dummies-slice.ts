import type { StateCreator } from "zustand";
import type { SnapshotStore, DummiesSlice } from "../types";
import { createLogger } from "@/utils/logger";

const log = createLogger('Store', 'DummiesSlice');

export const createDummiesSlice: StateCreator<
  SnapshotStore,
  [["zustand/immer", never]],
  [],
  DummiesSlice
> = (set, get) => ({
  dummies: [],

  setDummies: (dummies) =>
    set((state) => {
      log.debug('setDummies', 'replace all dummies', { count: dummies.length });
      state.dummies = dummies;
    }),

  addDummy: (dummy) =>
    set((state) => {
      log.debug('addDummy', 'add dummy', { id: dummy.id, type: dummy.type });
      state.dummies.push(dummy);
      state.sync.isDirty = true;
    }),

  updateDummy: (dummyId, updates) =>
    set((state) => {
      const idx = state.dummies.findIndex((d) => d.id === dummyId);
      if (idx !== -1) {
        log.debug('updateDummy', 'update dummy', { dummyId, updateKeys: Object.keys(updates) });
        Object.assign(state.dummies[idx], updates);
        state.sync.isDirty = true;
      }
    }),

  deleteDummy: (dummyId) =>
    set((state) => {
      log.debug('deleteDummy', 'delete dummy', { dummyId });
      state.dummies = state.dummies.filter((d) => d.id !== dummyId);
      state.sync.isDirty = true;
    }),

  getDummy: (dummyId) => get().dummies.find((d) => d.id === dummyId),

  addDummySpread: (dummyId, spread) =>
    set((state) => {
      const dummy = state.dummies.find((d) => d.id === dummyId);
      if (dummy) {
        log.debug('addDummySpread', 'add spread', { dummyId, spreadId: spread.id });
        dummy.spreads.push(spread);
        state.sync.isDirty = true;
      }
    }),

  updateDummySpread: (dummyId, spreadId, updates) =>
    set((state) => {
      const dummy = state.dummies.find((d) => d.id === dummyId);
      if (dummy) {
        const spreadIdx = dummy.spreads.findIndex((s) => s.id === spreadId);
        if (spreadIdx !== -1) {
          log.debug('updateDummySpread', 'update spread', { dummyId, spreadId, updateKeys: Object.keys(updates) });
          Object.assign(dummy.spreads[spreadIdx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deleteDummySpread: (dummyId, spreadId) =>
    set((state) => {
      const dummy = state.dummies.find((d) => d.id === dummyId);
      if (dummy) {
        log.debug('deleteDummySpread', 'delete spread', { dummyId, spreadId });
        dummy.spreads = dummy.spreads.filter((s) => s.id !== spreadId);
        state.sync.isDirty = true;
      }
    }),

  reorderDummySpreads: (dummyId, fromIndex, toIndex) =>
    set((state) => {
      const dummy = state.dummies.find((d) => d.id === dummyId);
      if (
        dummy &&
        fromIndex >= 0 &&
        toIndex >= 0 &&
        fromIndex < dummy.spreads.length &&
        toIndex < dummy.spreads.length
      ) {
        log.debug('reorderDummySpreads', 'reorder', { dummyId, fromIndex, toIndex });
        const [removed] = dummy.spreads.splice(fromIndex, 1);
        dummy.spreads.splice(toIndex, 0, removed);
        state.sync.isDirty = true;
      }
    }),

  updateDummySpreads: (dummyId, spreads) =>
    set((state) => {
      const dummy = state.dummies.find((d) => d.id === dummyId);
      if (dummy) {
        log.debug('updateDummySpreads', 'replace spreads', { dummyId, spreadCount: spreads.length });
        dummy.spreads = spreads;
        state.sync.isDirty = true;
      }
    }),
});
