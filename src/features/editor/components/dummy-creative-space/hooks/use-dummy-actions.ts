import { useSnapshotActions, useSnapshotStore } from '@/stores/snapshot-store';
import type { ManuscriptDummy, DummySpread } from '@/types/dummy';

export interface DummyActions {
  addDummy: (dummy: ManuscriptDummy) => void;
  updateDummy: (dummyId: string, updates: Partial<ManuscriptDummy>) => void;
  deleteDummy: (dummyId: string) => void;
  duplicateDummy: (dummyId: string) => ManuscriptDummy;
  addDummySpread: (dummyId: string, spread: DummySpread) => void;
  updateDummySpread: (dummyId: string, spreadId: string, updates: Partial<DummySpread>) => void;
  deleteDummySpread: (dummyId: string, spreadId: string) => void;
  reorderDummySpreads: (dummyId: string, fromIndex: number, toIndex: number) => void;
  saveSnapshot: () => Promise<void>;
}

export function useDummyActions(): DummyActions {
  const actions = useSnapshotActions();

  return {
    addDummy: actions.addDummy,
    updateDummy: actions.updateDummy,
    deleteDummy: actions.deleteDummy,
    duplicateDummy: (id: string): ManuscriptDummy => {
      const dummy = useSnapshotStore.getState().dummies.find((d) => d.id === id);
      if (!dummy) throw new Error(`Dummy ${id} not found`);
      const newDummy: ManuscriptDummy = {
        ...dummy,
        id: crypto.randomUUID(),
        title: `${dummy.title} (copy)`,
        spreads: dummy.spreads.map((s) => ({ ...s, id: crypto.randomUUID() })),
      };
      actions.addDummy(newDummy);
      return newDummy;
    },
    addDummySpread: actions.addDummySpread,
    updateDummySpread: actions.updateDummySpread,
    deleteDummySpread: actions.deleteDummySpread,
    reorderDummySpreads: actions.reorderDummySpreads,
    saveSnapshot: actions.saveSnapshot,
  };
}
