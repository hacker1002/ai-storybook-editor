import { useShallow } from 'zustand/react/shallow';
import { useSnapshotStore } from './index';
import type { DocType } from '@/types/editor';
import type { ManuscriptDummy, DummySpread } from '@/types/dummy';
import type { IllustrationData } from '@/types/illustration-types';
import type { RetouchData } from '@/types/retouch-types';
import type { Prop } from '@/types/prop-types';
import type { Character } from '@/types/character-types';
import type { Stage } from '@/types/stage-types';
import type { ImageTask } from './types';
import type { Section, SpreadNavigation, Branch, BranchSetting } from '@/types/spread-setting-types';
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
const EMPTY_PROPS: Prop[] = [];
const EMPTY_CHARACTERS: Character[] = [];
const EMPTY_STAGES: Stage[] = [];
const EMPTY_IMAGE_TASKS: ImageTask[] = [];
const EMPTY_SECTIONS: Section[] = [];
const EMPTY_BRANCHES: Branch[] = [];


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

// Illustration selectors
export const useIllustration = (): IllustrationData => useSnapshotStore((s) => s.illustration);
export const useIllustrationSpreads = (): BaseSpread[] => useSnapshotStore((s) => s.illustration.spreads);
export const useIllustrationSpreadIds = (): string[] =>
  useSnapshotStore(useShallow((s) => s.illustration.spreads.map((sp) => sp.id)));
export const useIllustrationSpreadById = (spreadId: string): BaseSpread | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId));
export const useIllustrationSpreadCount = (): number => useSnapshotStore((s) => s.illustration.spreads.length);

export const useIllustrationImageById = (spreadId: string, imageId: string): SpreadImage | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.images.find((i) => i.id === imageId));
export const useIllustrationTextboxById = (spreadId: string, textboxId: string): SpreadTextbox | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.textboxes.find((t) => t.id === textboxId));
export const useIllustrationShapeById = (spreadId: string, shapeId: string): SpreadShape | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.shapes?.find((sh) => sh.id === shapeId));

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

// Props selectors
export const useProps = (): Prop[] => useSnapshotStore((s) => s.props ?? EMPTY_PROPS);
export const usePropByKey = (key: string): Prop | undefined =>
  useSnapshotStore((s) => s.props.find((p) => p.key === key));
export const usePropKeys = (): string[] =>
  useSnapshotStore(useShallow((s) => s.props.map((p) => p.key)));

// Characters selectors
export const useCharacters = (): Character[] => useSnapshotStore((s) => s.characters ?? EMPTY_CHARACTERS);
export const useCharacterByKey = (key: string): Character | undefined =>
  useSnapshotStore((s) => s.characters.find((c) => c.key === key));
export const useCharacterKeys = (): string[] =>
  useSnapshotStore(useShallow((s) => s.characters.map((c) => c.key)));

// Stages selectors
export const useStages = (): Stage[] => useSnapshotStore((s) => s.stages ?? EMPTY_STAGES);
export const useStageByKey = (key: string): Stage | undefined =>
  useSnapshotStore((s) => s.stages.find((s) => s.key === key));
export const useStageKeys = (): string[] =>
  useSnapshotStore(useShallow((s) => s.stages.map((s) => s.key)));

// Image task selectors (ephemeral, not persisted)
export const useImageTasksForChild = (entityKey: string, childKey: string) =>
  useSnapshotStore(
    useShallow((s) => {
      const tasks = s.imageTasks ?? EMPTY_IMAGE_TASKS;
      const pending = tasks.find(
        (t) => t.entityKey === entityKey && t.childKey === childKey && t.status === 'pending'
      );
      return {
        isGenerating: pending?.taskType === 'generate',
        isEditing: pending?.taskType === 'edit',
        isProcessing: !!pending,
        pendingTask: pending,
      };
    })
  );

export const useHasPendingImageTasks = (): boolean =>
  useSnapshotStore((s) => (s.imageTasks ?? EMPTY_IMAGE_TASKS).some((t) => t.status === 'pending'));

export const useCompletedImageTasks = (): ImageTask[] =>
  useSnapshotStore(
    useShallow((s) => (s.imageTasks ?? EMPTY_IMAGE_TASKS).filter((t) => t.status === 'completed' || t.status === 'error'))
  );

// Spread setting selectors
export const useSections = (): Section[] =>
  useSnapshotStore((s) => s.spreadSetting.sections ?? EMPTY_SECTIONS);
export const useSectionIds = (): string[] =>
  useSnapshotStore(useShallow((s) => (s.spreadSetting.sections ?? EMPTY_SECTIONS).map((sec) => sec.id)));
export const useSectionById = (sectionId: string): Section | undefined =>
  useSnapshotStore((s) => s.spreadSetting.sections.find((sec) => sec.id === sectionId));
export const useSpreadNavigation = (spreadId: string): SpreadNavigation | undefined =>
  useSnapshotStore((s) => s.spreadSetting.spreads.find((sp) => sp.id === spreadId));
export const useSpreadHasBranching = (spreadId: string): boolean =>
  useSnapshotStore((s) => {
    const nav = s.spreadSetting.spreads.find((sp) => sp.id === spreadId);
    return !!nav?.branch_setting && nav.branch_setting.branches.length > 0;
  });
export const useSpreadNextId = (spreadId: string): string | null | undefined =>
  useSnapshotStore((s) => s.spreadSetting.spreads.find((sp) => sp.id === spreadId)?.next_spread_id);
export const useBranchSetting = (spreadId: string): BranchSetting | undefined =>
  useSnapshotStore((s) => s.spreadSetting.spreads.find((sp) => sp.id === spreadId)?.branch_setting);
export const useBranches = (spreadId: string): Branch[] =>
  useSnapshotStore((s) => s.spreadSetting.spreads.find((sp) => sp.id === spreadId)?.branch_setting?.branches ?? EMPTY_BRANCHES);

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
      // Illustration
      setIllustration: s.setIllustration,
      addIllustrationSpread: s.addIllustrationSpread,
      updateIllustrationSpread: s.updateIllustrationSpread,
      deleteIllustrationSpread: s.deleteIllustrationSpread,
      reorderIllustrationSpreads: s.reorderIllustrationSpreads,
      addIllustrationImage: s.addIllustrationImage,
      updateIllustrationImage: s.updateIllustrationImage,
      deleteIllustrationImage: s.deleteIllustrationImage,
      addIllustrationTextbox: s.addIllustrationTextbox,
      updateIllustrationTextbox: s.updateIllustrationTextbox,
      deleteIllustrationTextbox: s.deleteIllustrationTextbox,
      addIllustrationShape: s.addIllustrationShape,
      updateIllustrationShape: s.updateIllustrationShape,
      deleteIllustrationShape: s.deleteIllustrationShape,
      clearIllustration: s.clearIllustration,
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
      deleteRetouchAnimationsByTargetId: s.deleteRetouchAnimationsByTargetId,
      reorderRetouchAnimations: s.reorderRetouchAnimations,
      clearRetouch: s.clearRetouch,
      // Props
      setProps: s.setProps,
      addProp: s.addProp,
      updateProp: s.updateProp,
      deleteProp: s.deleteProp,
      reorderProps: s.reorderProps,
      addPropVariant: s.addPropVariant,
      updatePropVariant: s.updatePropVariant,
      deletePropVariant: s.deletePropVariant,
      addPropSound: s.addPropSound,
      updatePropSound: s.updatePropSound,
      deletePropSound: s.deletePropSound,
      addPropCropSheet: s.addPropCropSheet,
      updatePropCropSheet: s.updatePropCropSheet,
      deletePropCropSheet: s.deletePropCropSheet,
      // Characters
      setCharacters: s.setCharacters,
      addCharacter: s.addCharacter,
      updateCharacter: s.updateCharacter,
      deleteCharacter: s.deleteCharacter,
      reorderCharacters: s.reorderCharacters,
      addCharacterVariant: s.addCharacterVariant,
      updateCharacterVariant: s.updateCharacterVariant,
      deleteCharacterVariant: s.deleteCharacterVariant,
      addCharacterVoice: s.addCharacterVoice,
      updateCharacterVoice: s.updateCharacterVoice,
      deleteCharacterVoice: s.deleteCharacterVoice,
      addCharacterCropSheet: s.addCharacterCropSheet,
      updateCharacterCropSheet: s.updateCharacterCropSheet,
      deleteCharacterCropSheet: s.deleteCharacterCropSheet,
      // Stages
      setStages: s.setStages,
      addStage: s.addStage,
      updateStage: s.updateStage,
      deleteStage: s.deleteStage,
      reorderStages: s.reorderStages,
      addStageVariant: s.addStageVariant,
      updateStageVariant: s.updateStageVariant,
      deleteStageVariant: s.deleteStageVariant,
      addStageSound: s.addStageSound,
      updateStageSound: s.updateStageSound,
      deleteStageSound: s.deleteStageSound,
      // Spread Setting
      setSpreadSetting: s.setSpreadSetting,
      resetSpreadSetting: s.resetSpreadSetting,
      addSection: s.addSection,
      updateSection: s.updateSection,
      deleteSection: s.deleteSection,
      setSpreadNavigation: s.setSpreadNavigation,
      removeSpreadNavigation: s.removeSpreadNavigation,
      setNextSpreadId: s.setNextSpreadId,
      clearNextSpreadId: s.clearNextSpreadId,
      setBranchSetting: s.setBranchSetting,
      clearBranchSetting: s.clearBranchSetting,
      addBranch: s.addBranch,
      updateBranch: s.updateBranch,
      deleteBranch: s.deleteBranch,
      reorderBranches: s.reorderBranches,
      updateBranchSettingLocale: s.updateBranchSettingLocale,
      deleteBranchSettingLocale: s.deleteBranchSettingLocale,
      updateBranchLocale: s.updateBranchLocale,
      deleteBranchLocale: s.deleteBranchLocale,
      // Meta
      setMeta: s.setMeta,
      markDirty: s.markDirty,
      markClean: s.markClean,
      setSaving: s.setSaving,
      setSaveError: s.setSaveError,
      // Image Tasks
      startGenerateTask: s.startGenerateTask,
      startEditTask: s.startEditTask,
      dismissTask: s.dismissTask,
      clearAllTasks: s.clearAllTasks,
      // Top-level
      initSnapshot: s.initSnapshot,
      resetSnapshot: s.resetSnapshot,
      fetchSnapshot: s.fetchSnapshot,
      saveSnapshot: s.saveSnapshot,
    })),
  );
