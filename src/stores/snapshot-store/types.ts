import type { ManuscriptDoc, SnapshotMeta, SyncState, DocType } from '@/types/editor';
import type { ManuscriptDummy, DummySpread } from '@/types/dummy';
import type { RetouchData } from '@/types/retouch-types';
import type {
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  SpreadQuiz,
  SpreadAnimation,
} from '@/types/spread-types';

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

export interface DummiesSlice {
  dummies: ManuscriptDummy[];
  setDummies: (dummies: ManuscriptDummy[]) => void;
  addDummy: (dummy: ManuscriptDummy) => void;
  updateDummy: (dummyId: string, updates: Partial<ManuscriptDummy>) => void;
  deleteDummy: (dummyId: string) => void;
  getDummy: (dummyId: string) => ManuscriptDummy | undefined;
  addDummySpread: (dummyId: string, spread: DummySpread) => void;
  updateDummySpread: (dummyId: string, spreadId: string, updates: Partial<DummySpread>) => void;
  deleteDummySpread: (dummyId: string, spreadId: string) => void;
  reorderDummySpreads: (dummyId: string, fromIndex: number, toIndex: number) => void;
  updateDummySpreads: (dummyId: string, spreads: DummySpread[]) => void;
}

export interface RetouchSlice {
  retouch: RetouchData;

  setRetouch: (data: RetouchData) => void;

  addRetouchSpread: (spread: BaseSpread) => void;
  updateRetouchSpread: (spreadId: string, updates: Partial<BaseSpread>) => void;
  deleteRetouchSpread: (spreadId: string) => void;
  reorderRetouchSpreads: (fromIndex: number, toIndex: number) => void;

  addRetouchImage: (spreadId: string, image: SpreadImage) => void;
  updateRetouchImage: (spreadId: string, imageId: string, updates: Partial<SpreadImage>) => void;
  deleteRetouchImage: (spreadId: string, imageId: string) => void;

  addRetouchTextbox: (spreadId: string, textbox: SpreadTextbox) => void;
  updateRetouchTextbox: (spreadId: string, textboxId: string, updates: Partial<SpreadTextbox>) => void;
  deleteRetouchTextbox: (spreadId: string, textboxId: string) => void;

  addRetouchShape: (spreadId: string, shape: SpreadShape) => void;
  updateRetouchShape: (spreadId: string, shapeId: string, updates: Partial<SpreadShape>) => void;
  deleteRetouchShape: (spreadId: string, shapeId: string) => void;

  addRetouchVideo: (spreadId: string, video: SpreadVideo) => void;
  updateRetouchVideo: (spreadId: string, videoId: string, updates: Partial<SpreadVideo>) => void;
  deleteRetouchVideo: (spreadId: string, videoId: string) => void;

  addRetouchAudio: (spreadId: string, audio: SpreadAudio) => void;
  updateRetouchAudio: (spreadId: string, audioId: string, updates: Partial<SpreadAudio>) => void;
  deleteRetouchAudio: (spreadId: string, audioId: string) => void;

  addRetouchQuiz: (spreadId: string, quiz: SpreadQuiz) => void;
  updateRetouchQuiz: (spreadId: string, quizId: string, updates: Partial<SpreadQuiz>) => void;
  deleteRetouchQuiz: (spreadId: string, quizId: string) => void;

  addRetouchAnimation: (spreadId: string, animation: SpreadAnimation) => void;
  updateRetouchAnimation: (spreadId: string, animationIndex: number, updates: Partial<SpreadAnimation>) => void;
  deleteRetouchAnimation: (spreadId: string, animationIndex: number) => void;
  reorderRetouchAnimations: (spreadId: string, fromIndex: number, toIndex: number) => void;

  clearRetouch: () => void;
}

export type SnapshotStore = DocsSlice & MetaSlice & FetchSlice & DummiesSlice & RetouchSlice & {
  initSnapshot: (data: { docs?: ManuscriptDoc[]; dummies?: ManuscriptDummy[]; retouch?: RetouchData; meta?: Partial<SnapshotMeta> }) => void;
  resetSnapshot: () => void;
};
