import { useShallow } from 'zustand/react/shallow';
import { useSnapshotStore } from './index';
import type { DocType } from '@/types/editor';
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

// Stable empty array refs to avoid new [] on every selector evaluation (prevents re-render loops)
const EMPTY_SPREADS: DummySpread[] = [];
const EMPTY_QUIZZES: SpreadQuiz[] = [];
const EMPTY_ANIMATIONS: SpreadAnimation[] = [];

// Meta selectors
export const useSnapshotId = () => useSnapshotStore((s) => s.meta.id);
export const useIsDirty = () => useSnapshotStore((s) => s.sync.isDirty);
export const useIsSaving = () => useSnapshotStore((s) => s.sync.isSaving);
export const useSyncState = () => useSnapshotStore((s) => s.sync);

// Docs selectors
export const useDocs = () => useSnapshotStore((s) => s.docs);
export const useDocByIndex = (index: number) => useSnapshotStore((s) => s.docs[index]);
export const useDocByType = (type: DocType) =>
  useSnapshotStore((s) => s.docs.find((d) => d.type === type));

// Fetch state selectors
export const useSnapshotFetchLoading = () => useSnapshotStore((s) => s.fetchLoading);
export const useSnapshotFetchError = () => useSnapshotStore((s) => s.fetchError);

// Dummies selectors
export const useDummies = (): ManuscriptDummy[] => useSnapshotStore((s) => s.dummies);
export const useDummyIds = (): string[] =>
  useSnapshotStore(useShallow((s) => s.dummies.map((d) => d.id)));
export const useDummyById = (dummyId: string): ManuscriptDummy | undefined =>
  useSnapshotStore((s) => s.dummies.find((d) => d.id === dummyId));
export const useDummySpreads = (dummyId: string): DummySpread[] =>
  useSnapshotStore((s) => s.dummies.find((d) => d.id === dummyId)?.spreads ?? EMPTY_SPREADS);
export const useDummySpreadIds = (dummyId: string): string[] =>
  useSnapshotStore(
    useShallow((s) => s.dummies.find((d) => d.id === dummyId)?.spreads.map((sp) => sp.id) ?? [])
  );

// Retouch selectors
export const useRetouch = (): RetouchData => useSnapshotStore((s) => s.retouch);
export const useRetouchSpreads = (): BaseSpread[] => useSnapshotStore((s) => s.retouch.spreads);
export const useRetouchSpreadIds = (): string[] =>
  useSnapshotStore(useShallow((s) => s.retouch.spreads.map((sp) => sp.id)));
export const useRetouchSpreadById = (spreadId: string): BaseSpread | undefined =>
  useSnapshotStore((s) => s.retouch.spreads.find((sp) => sp.id === spreadId));
export const useRetouchSpreadCount = (): number => useSnapshotStore((s) => s.retouch.spreads.length);

export const useRetouchImageById = (spreadId: string, imageId: string): SpreadImage | undefined =>
  useSnapshotStore((s) => s.retouch.spreads.find((sp) => sp.id === spreadId)?.images.find((i) => i.id === imageId));
export const useRetouchTextboxById = (spreadId: string, textboxId: string): SpreadTextbox | undefined =>
  useSnapshotStore((s) => s.retouch.spreads.find((sp) => sp.id === spreadId)?.textboxes.find((t) => t.id === textboxId));
export const useRetouchShapeById = (spreadId: string, shapeId: string): SpreadShape | undefined =>
  useSnapshotStore((s) => s.retouch.spreads.find((sp) => sp.id === spreadId)?.shapes?.find((sh) => sh.id === shapeId));
export const useRetouchVideoById = (spreadId: string, videoId: string): SpreadVideo | undefined =>
  useSnapshotStore((s) => s.retouch.spreads.find((sp) => sp.id === spreadId)?.videos?.find((v) => v.id === videoId));
export const useRetouchAudioById = (spreadId: string, audioId: string): SpreadAudio | undefined =>
  useSnapshotStore((s) => s.retouch.spreads.find((sp) => sp.id === spreadId)?.audios?.find((a) => a.id === audioId));
export const useRetouchQuizById = (spreadId: string, quizId: string): SpreadQuiz | undefined =>
  useSnapshotStore((s) => s.retouch.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId));
export const useRetouchQuizzes = (spreadId: string): SpreadQuiz[] =>
  useSnapshotStore((s) => s.retouch.spreads.find((sp) => sp.id === spreadId)?.quizzes ?? EMPTY_QUIZZES);
export const useRetouchAnimations = (spreadId: string): SpreadAnimation[] =>
  useSnapshotStore((s) => s.retouch.spreads.find((sp) => sp.id === spreadId)?.animations ?? EMPTY_ANIMATIONS);

// Computed: find all images/videos derived from a specific original illustration image
export const useRetouchObjectsByImageId = (
  spreadId: string,
  originalImageId: string,
): (SpreadImage | SpreadVideo)[] =>
  useSnapshotStore(
    useShallow((s) => {
      const spread = s.retouch.spreads.find((sp) => sp.id === spreadId);
      if (!spread) return [];
      const images = spread.images.filter((i) => i.original_image_id === originalImageId);
      const videos = (spread.videos ?? []).filter((v) => v.original_image_id === originalImageId);
      return [...images, ...videos];
    }),
  );

// Actions-only hook (no re-render on state changes)
export const useSnapshotActions = () =>
  useSnapshotStore(
    useShallow((s) => ({
      // Docs
      setDocs: s.setDocs,
      addDoc: s.addDoc,
      updateDoc: s.updateDoc,
      updateDocTitle: s.updateDocTitle,
      deleteDoc: s.deleteDoc,
      // Dummies
      setDummies: s.setDummies,
      addDummy: s.addDummy,
      updateDummy: s.updateDummy,
      deleteDummy: s.deleteDummy,
      addDummySpread: s.addDummySpread,
      updateDummySpread: s.updateDummySpread,
      deleteDummySpread: s.deleteDummySpread,
      reorderDummySpreads: s.reorderDummySpreads,
      updateDummySpreads: s.updateDummySpreads,
      // Retouch
      setRetouch: s.setRetouch,
      addRetouchSpread: s.addRetouchSpread,
      updateRetouchSpread: s.updateRetouchSpread,
      deleteRetouchSpread: s.deleteRetouchSpread,
      reorderRetouchSpreads: s.reorderRetouchSpreads,
      addRetouchImage: s.addRetouchImage,
      updateRetouchImage: s.updateRetouchImage,
      deleteRetouchImage: s.deleteRetouchImage,
      addRetouchTextbox: s.addRetouchTextbox,
      updateRetouchTextbox: s.updateRetouchTextbox,
      deleteRetouchTextbox: s.deleteRetouchTextbox,
      addRetouchShape: s.addRetouchShape,
      updateRetouchShape: s.updateRetouchShape,
      deleteRetouchShape: s.deleteRetouchShape,
      addRetouchVideo: s.addRetouchVideo,
      updateRetouchVideo: s.updateRetouchVideo,
      deleteRetouchVideo: s.deleteRetouchVideo,
      addRetouchAudio: s.addRetouchAudio,
      updateRetouchAudio: s.updateRetouchAudio,
      deleteRetouchAudio: s.deleteRetouchAudio,
      addRetouchQuiz: s.addRetouchQuiz,
      updateRetouchQuiz: s.updateRetouchQuiz,
      deleteRetouchQuiz: s.deleteRetouchQuiz,
      addRetouchAnimation: s.addRetouchAnimation,
      updateRetouchAnimation: s.updateRetouchAnimation,
      deleteRetouchAnimation: s.deleteRetouchAnimation,
      reorderRetouchAnimations: s.reorderRetouchAnimations,
      clearRetouch: s.clearRetouch,
      // Meta
      setMeta: s.setMeta,
      markDirty: s.markDirty,
      markClean: s.markClean,
      setSaving: s.setSaving,
      setSaveError: s.setSaveError,
      // Top-level
      initSnapshot: s.initSnapshot,
      resetSnapshot: s.resetSnapshot,
      fetchSnapshot: s.fetchSnapshot,
      saveSnapshot: s.saveSnapshot,
    })),
  );
