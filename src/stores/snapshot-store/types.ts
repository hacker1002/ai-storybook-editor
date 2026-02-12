import type { ManuscriptDoc, SnapshotMeta, SyncState, DocType } from '@/types/editor';

export interface DocsSlice {
  docs: ManuscriptDoc[];
  setDocs: (docs: ManuscriptDoc[]) => void;
  addDoc: (doc: ManuscriptDoc) => void;
  updateDoc: (index: number, updates: Partial<ManuscriptDoc>) => void;
  updateDocTitle: (index: number, title: string) => void;
  deleteDoc: (index: number) => void;
  getDoc: (docType: DocType) => ManuscriptDoc | undefined;
}

export interface MetaSlice {
  meta: SnapshotMeta;
  sync: SyncState;
  setMeta: (meta: SnapshotMeta) => void;
  markDirty: () => void;
  markClean: () => void;
  setSaving: (isSaving: boolean) => void;
  setSaveError: (error: string | null) => void;
}

export interface FetchSlice {
  fetchLoading: boolean;
  fetchError: string | null;
  fetchSnapshot: (bookId: string) => Promise<void>;
  saveSnapshot: () => Promise<void>;
}

export type SnapshotStore = DocsSlice & MetaSlice & FetchSlice & {
  initSnapshot: (data: { docs?: ManuscriptDoc[]; meta?: Partial<SnapshotMeta> }) => void;
  resetSnapshot: () => void;
};
