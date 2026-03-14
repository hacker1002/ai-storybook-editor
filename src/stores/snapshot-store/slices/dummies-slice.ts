import type { StateCreator } from "zustand";
import type { SnapshotStore, DummiesSlice } from "../types";

export const createDummiesSlice: StateCreator<
  SnapshotStore,
  [["zustand/immer", never]],
  [],
  DummiesSlice
> = (set, get) => ({
  dummies: [],

  setDummies: (dummies) =>
    set((state) => {
      state.dummies = dummies;
    }),

  addDummy: (dummy) =>
    set((state) => {
      state.dummies.push(dummy);
      state.sync.isDirty = true;
    }),

  updateDummy: (dummyId, updates) =>
    set((state) => {
      const idx = state.dummies.findIndex((d) => d.id === dummyId);
      if (idx !== -1) {
        Object.assign(state.dummies[idx], updates);
        state.sync.isDirty = true;
      }
    }),

  deleteDummy: (dummyId) =>
    set((state) => {
      state.dummies = state.dummies.filter((d) => d.id !== dummyId);
      state.sync.isDirty = true;
    }),

  getDummy: (dummyId) => get().dummies.find((d) => d.id === dummyId),

  addDummySpread: (dummyId, spread) =>
    set((state) => {
      const dummy = state.dummies.find((d) => d.id === dummyId);
      if (dummy) {
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
          Object.assign(dummy.spreads[spreadIdx], updates);
          state.sync.isDirty = true;
        }
      }
    }),

  deleteDummySpread: (dummyId, spreadId) =>
    set((state) => {
      const dummy = state.dummies.find((d) => d.id === dummyId);
      if (dummy) {
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
        const [removed] = dummy.spreads.splice(fromIndex, 1);
        dummy.spreads.splice(toIndex, 0, removed);
        state.sync.isDirty = true;
      }
    }),

  updateDummySpreads: (dummyId, spreads) =>
    set((state) => {
      const dummy = state.dummies.find((d) => d.id === dummyId);
      if (dummy) {
        dummy.spreads = spreads;
        state.sync.isDirty = true;
      }
    }),
});
