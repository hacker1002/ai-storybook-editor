import { useShallow } from 'zustand/react/shallow';
import { useSnapshotStore } from './index';
import type { DocType, SaveStatus, SyncState } from '@/types/editor';
import type { Sketch, SketchEntity, SketchEntityKind, SketchSpread } from '@/types/sketch';
import type { ManuscriptDummy, DummySpread } from '@/types/dummy';
import type { IllustrationData, Section, Branch, BranchSetting } from '@/types/illustration-types';
import type { Prop } from '@/types/prop-types';
import type { Character } from '@/types/character-types';
import type { Stage } from '@/types/stage-types';
import type { ImageTask, QuizValidationIssue } from './types';
import type {
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAutoPic,
  SpreadAudio,
  SpreadQuiz,
  SpreadAnimation,
  QuizType,
  QuizItem,
  QuizPair,
  QuizTargetZone,
  QuizDecorImage,
  QuizAnswerSetting,
  QuizContainer,
  ItemContainer,
} from '@/types/spread-types';

// Stable empty array refs to avoid new [] on every selector evaluation (prevents re-render loops)
const EMPTY_SPREADS: DummySpread[] = [];
const EMPTY_QUIZZES: SpreadQuiz[] = [];
const EMPTY_QUIZ_ITEMS: QuizItem[] = [];
const EMPTY_QUIZ_PAIRS: QuizPair[] = [];
const EMPTY_QUIZ_ZONES: QuizTargetZone[] = [];
const EMPTY_QUIZ_IMAGES: QuizDecorImage[] = [];
const EMPTY_QUIZ_ISSUES: QuizValidationIssue[] = [];
const EMPTY_QUIZ_ERRORS_MAP: Record<string, QuizValidationIssue[]> = {};
const EMPTY_ANIMATIONS: SpreadAnimation[] = [];
const EMPTY_PROPS: Prop[] = [];
const EMPTY_CHARACTERS: Character[] = [];
const EMPTY_STAGES: Stage[] = [];
const EMPTY_SKETCH_ENTITIES: SketchEntity[] = [];
const EMPTY_IMAGE_TASKS: ImageTask[] = [];
const EMPTY_SECTIONS: Section[] = [];
const EMPTY_BRANCHES: Branch[] = [];


// Derives SaveStatus from SyncState — pure function, usable outside React
export function deriveSaveStatus(sync: SyncState): SaveStatus {
  if (sync.isAutoSaving) return 'auto-saving';
  if (sync.isSaving) return 'manual-saving';
  if (sync.isDirty) return 'dirty';
  if (
    sync.lastSavedAt &&
    (!sync.lastManualSavedAt || sync.lastSavedAt > sync.lastManualSavedAt)
  )
    return 'auto-saved';
  return 'saved';
}

// Meta selectors
export const useSnapshotId = () => useSnapshotStore((s) => s.meta.id);
export const useIsDirty = () => useSnapshotStore((s) => s.sync.isDirty);
export const useIsSaving = () => useSnapshotStore((s) => s.sync.isSaving);
export const useIsAutoSaving = () => useSnapshotStore((s) => s.sync.isAutoSaving);
export const useSyncState = () => useSnapshotStore((s) => s.sync);

export const useCanManualSave = (): boolean =>
  useSnapshotStore((s) => {
    const { isDirty, lastSavedAt, lastManualSavedAt } = s.sync;
    if (isDirty) return true;
    if (lastSavedAt && lastManualSavedAt == null) return true;
    if (lastSavedAt && lastManualSavedAt && lastSavedAt > lastManualSavedAt) return true;
    return false;
  });

// Docs selectors
export const useDocs = () => useSnapshotStore((s) => s.docs);
export const useDocByIndex = (index: number) => useSnapshotStore((s) => s.docs[index]);
export const useDocByType = (type: DocType) =>
  useSnapshotStore((s) => s.docs.find((d) => d.type === type));

// Sketch selector (whole-object ref; replaced only on load/setSketch/clearSketch)
export const useSketch = (): Sketch => useSnapshotStore((s) => s.sketch);

// Sketch entity selectors — keyed by kind (characters | props | stages).
// useSketchEntityKeys mirrors useCharacterKeys: single .map() under useShallow is the
// proven flat-string[] pattern (NOT the object-of-arrays anti-pattern that loops).
export const useSketchEntities = (kind: SketchEntityKind): SketchEntity[] =>
  useSnapshotStore((s) => s.sketch[kind] ?? EMPTY_SKETCH_ENTITIES);
export const useSketchEntityByKey = (
  kind: SketchEntityKind,
  key: string
): SketchEntity | undefined =>
  useSnapshotStore((s) => (s.sketch[kind] ?? EMPTY_SKETCH_ENTITIES).find((e) => e.key === key));
export const useSketchEntityKeys = (kind: SketchEntityKind): string[] =>
  useSnapshotStore(useShallow((s) => (s.sketch[kind] ?? EMPTY_SKETCH_ENTITIES).map((e) => e.key)));

// Sketch spread selectors — ID-based (mirror illustration spreads: useShallow+map for the id
// list, whole-object find for a single spread). Drives the sketch-spread creative space.
export const useSketchSpreadIds = (): string[] =>
  useSnapshotStore(useShallow((s) => s.sketch.spreads.map((sp) => sp.id)));
export const useSketchSpreadById = (spreadId: string): SketchSpread | undefined =>
  useSnapshotStore((s) => s.sketch.spreads.find((sp) => sp.id === spreadId));

// Sketch generate-job selectors (ephemeral, not persisted).
// Ref-stability matters (memory: useShallow footgun on object-of-fresh-arrays):
//  - useSketchGenerateJob returns the stable store ref directly (Object.is) — no useShallow.
//  - useIsSketchGenerating returns a boolean primitive — no useShallow.
//  - useSketchGenerateProgress / useSketchEntityGenerating build fresh objects of PRIMITIVES
//    only → useShallow is safe (shallow-eq on strings/bools, never on nested arrays).
export const useSketchGenerateJob = () => useSnapshotStore((s) => s.sketchGenerateJob);

export const useIsSketchGenerating = (): boolean =>
  useSnapshotStore((s) => s.sketchGenerateJob?.status === 'running');

export const useSketchGenerateProgress = () =>
  useSnapshotStore(
    useShallow((s) => {
      const job = s.sketchGenerateJob;
      if (!job) return null;
      const done = job.tasks.filter((t) => t.status === 'completed' || t.status === 'error').length;
      return { done, total: job.tasks.length };
    }),
  );

export const useSketchEntityGenerating = (kind: SketchEntityKind, entityKey: string) =>
  useSnapshotStore(
    useShallow((s) => {
      const job = s.sketchGenerateJob;
      const task = job && job.kind === kind ? job.tasks.find((t) => t.entityKey === entityKey) : undefined;
      const status = task?.status ?? 'idle';
      return { status, isGenerating: status === 'running', error: task?.error };
    }),
  );

// Sketch SPREAD generate-job selectors (ephemeral). Same ref-stability discipline as the entity
// job above: stable ref / boolean → no useShallow; fresh objects of PRIMITIVES → useShallow safe.
export const useSketchSpreadGenerateJob = () => useSnapshotStore((s) => s.sketchSpreadGenerateJob);

export const useIsSketchSpreadGenerating = (): boolean =>
  useSnapshotStore((s) => s.sketchSpreadGenerateJob?.status === 'running');

export const useSketchSpreadGenerateProgress = () =>
  useSnapshotStore(
    useShallow((s) => {
      const job = s.sketchSpreadGenerateJob;
      if (!job) return null;
      const done = job.tasks.filter((t) => t.status === 'completed' || t.status === 'error').length;
      return { done, total: job.tasks.length };
    }),
  );

export const useSketchSpreadGenerating = (spreadId: string) =>
  useSnapshotStore(
    useShallow((s) => {
      const task = s.sketchSpreadGenerateJob?.tasks.find((t) => t.spreadId === spreadId);
      const status = task?.status ?? 'idle';
      return { status, isGenerating: status === 'running', error: task?.error };
    }),
  );

// Unified 1-sketch-job guard: true while EITHER the entity-sheet job OR the spread-image job is
// running. Single store read (both Generate buttons + the nav-guard share it). Boolean → no useShallow.
export const useIsAnySketchGenerating = (): boolean =>
  useSnapshotStore(
    (s) =>
      s.sketchGenerateJob?.status === 'running' || s.sketchSpreadGenerateJob?.status === 'running',
  );

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

// Raw layer selectors (illustration phase — editor-only)
export const useRawImageById = (spreadId: string, imageId: string): SpreadImage | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.raw_images?.find((i) => i.id === imageId));
export const useRawTextboxById = (spreadId: string, textboxId: string): SpreadTextbox | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.raw_textboxes?.find((t) => t.id === textboxId));

// Retouch selectors (reads from unified illustration.spreads — playable layers)
export const useRetouchSpreads = (): BaseSpread[] => useSnapshotStore((s) => s.illustration.spreads);
export const useRetouchSpreadIds = (): string[] =>
  useSnapshotStore(useShallow((s) => s.illustration.spreads.map((sp) => sp.id)));
export const useRetouchSpreadById = (spreadId: string): BaseSpread | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId));
export const useRetouchSpreadCount = (): number => useSnapshotStore((s) => s.illustration.spreads.length);

export const useRetouchImageById = (spreadId: string, imageId: string): SpreadImage | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.images.find((i) => i.id === imageId));
export const useRetouchTextboxById = (spreadId: string, textboxId: string): SpreadTextbox | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.textboxes.find((t) => t.id === textboxId));
export const useRetouchShapeById = (spreadId: string, shapeId: string): SpreadShape | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.shapes?.find((sh) => sh.id === shapeId));
export const useRetouchVideoById = (spreadId: string, videoId: string): SpreadVideo | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.videos?.find((v) => v.id === videoId));
export const useRetouchAutoPicById = (spreadId: string, autoPicId: string): SpreadAutoPic | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.auto_pics?.find((p) => p.id === autoPicId));
export const useRetouchAudioById = (spreadId: string, audioId: string): SpreadAudio | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.audios?.find((a) => a.id === audioId));
export const useRetouchAnimations = (spreadId: string): SpreadAnimation[] =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.animations ?? EMPTY_ANIMATIONS);

// ============================================================================
// Quiz selectors (QuizSlice — quiz data reads from illustration.spreads[])
// ============================================================================

export const useQuizzes = (spreadId: string): SpreadQuiz[] =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes ?? EMPTY_QUIZZES);
export const useQuizById = (spreadId: string, quizId: string): SpreadQuiz | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId));
export const useQuizType = (spreadId: string, quizId: string): QuizType | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId)?.type);

// Nested collections
export const useQuizItems = (spreadId: string, quizId: string): QuizItem[] =>
  useSnapshotStore((s) => {
    const quiz = s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId);
    return quiz?.elements.items ?? EMPTY_QUIZ_ITEMS;
  });
export const useQuizItemById = (spreadId: string, quizId: string, itemId: string): QuizItem | undefined =>
  useSnapshotStore((s) => {
    const quiz = s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId);
    return quiz?.elements.items?.find((i) => i.id === itemId);
  });
export const useQuizPairs = (spreadId: string, quizId: string): QuizPair[] =>
  useSnapshotStore((s) => {
    const quiz = s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId);
    return quiz?.elements.pairs ?? EMPTY_QUIZ_PAIRS;
  });
export const useQuizTargetZones = (spreadId: string, quizId: string): QuizTargetZone[] =>
  useSnapshotStore((s) => {
    const quiz = s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId);
    return quiz?.elements.target_zones ?? EMPTY_QUIZ_ZONES;
  });
export const useQuizTargetZoneById = (spreadId: string, quizId: string, zoneId: string): QuizTargetZone | undefined =>
  useSnapshotStore((s) => {
    const quiz = s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId);
    return quiz?.elements.target_zones?.find((z) => z.id === zoneId);
  });
export const useQuizDecorImages = (spreadId: string, quizId: string): QuizDecorImage[] =>
  useSnapshotStore((s) => {
    const quiz = s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId);
    return quiz?.elements.images ?? EMPTY_QUIZ_IMAGES;
  });

// Settings
export const useQuizAnswerSetting = (spreadId: string, quizId: string): QuizAnswerSetting | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId)?.answer_setting);
export const useQuizContainer = (spreadId: string, quizId: string): QuizContainer | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId)?.quiz_container);
export const useQuizItemContainer = (spreadId: string, quizId: string): ItemContainer | undefined =>
  useSnapshotStore((s) => s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId)?.item_container);

// Computed helpers
export const useQuizDistractorItems = (spreadId: string, quizId: string): QuizItem[] =>
  useSnapshotStore(
    useShallow((s) => {
      const quiz = s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId);
      const items = quiz?.elements.items ?? EMPTY_QUIZ_ITEMS;
      if (quiz?.type === 2) {
        return items.filter((i) => i.order === null || i.order === undefined);
      }
      if (quiz?.type === 1) {
        const pairs = quiz.elements.pairs ?? [];
        const paired = new Set<string>();
        pairs.forEach((p) => { paired.add(p.source_id); paired.add(p.target_id); });
        return items.filter((i) => !paired.has(i.id));
      }
      return EMPTY_QUIZ_ITEMS;
    }),
  );
export const useQuizSourceItems = (spreadId: string, quizId: string): QuizItem[] =>
  useSnapshotStore(
    useShallow((s) => {
      const quiz = s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId);
      return (quiz?.elements.items ?? EMPTY_QUIZ_ITEMS).filter((i) => i.type === 'source');
    }),
  );
export const useQuizTargetItems = (spreadId: string, quizId: string): QuizItem[] =>
  useSnapshotStore(
    useShallow((s) => {
      const quiz = s.illustration.spreads.find((sp) => sp.id === spreadId)?.quizzes?.find((q) => q.id === quizId);
      return (quiz?.elements.items ?? EMPTY_QUIZ_ITEMS).filter((i) => i.type === 'target');
    }),
  );

// Validation selectors (QuizSlice own state)
export const useQuizValidationIssues = (quizId: string): QuizValidationIssue[] =>
  useSnapshotStore((s) => s.quizValidationErrors[quizId] ?? EMPTY_QUIZ_ISSUES);
export const useQuizBlockingErrors = (quizId: string): QuizValidationIssue[] =>
  useSnapshotStore(
    useShallow((s) => (s.quizValidationErrors[quizId] ?? EMPTY_QUIZ_ISSUES).filter((i) => i.severity === 'error')),
  );
export const useHasBlockingQuizErrors = (): boolean =>
  useSnapshotStore((s) =>
    Object.values(s.quizValidationErrors).some((issues) => issues.some((i) => i.severity === 'error')),
  );
export const useAllQuizValidationErrors = (): Record<string, QuizValidationIssue[]> =>
  useSnapshotStore((s) => s.quizValidationErrors ?? EMPTY_QUIZ_ERRORS_MAP);

// Computed: find all images/videos/auto_pics derived from a specific original illustration image
export const useRetouchObjectsByImageId = (
  spreadId: string,
  originalImageId: string,
): (SpreadImage | SpreadVideo | SpreadAutoPic)[] =>
  useSnapshotStore(
    useShallow((s) => {
      const spread = s.illustration.spreads.find((sp) => sp.id === spreadId);
      if (!spread) return [];
      const images = (spread.images ?? []).filter((i) => i.original_image_id === originalImageId);
      const videos = (spread.videos ?? []).filter((v) => v.original_image_id === originalImageId);
      const autoPics = (spread.auto_pics ?? []).filter((p) => p.original_image_id === originalImageId);
      return [...images, ...videos, ...autoPics];
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

// Spread setting selectors (now query from illustration)
export const useSections = (): Section[] =>
  useSnapshotStore((s) => s.illustration.sections ?? EMPTY_SECTIONS);
export const useSectionIds = (): string[] =>
  useSnapshotStore(useShallow((s) => (s.illustration.sections ?? EMPTY_SECTIONS).map((sec) => sec.id)));
export const useSectionById = (sectionId: string): Section | undefined =>
  useSnapshotStore((s) => s.illustration.sections?.find((sec) => sec.id === sectionId));
export const useSpreadNavigation = (spreadId: string): BaseSpread | undefined =>
  useSnapshotStore((s) => s.illustration.spreads?.find((sp) => sp.id === spreadId));
export const useSpreadHasBranching = (spreadId: string): boolean =>
  useSnapshotStore((s) => {
    const spread = s.illustration.spreads?.find((sp) => sp.id === spreadId);
    return !!spread?.branch_setting && spread.branch_setting.branches.length > 0;
  });
/** next_spread_id of the section ending at spreadId — undefined means follow array order */
export const useSpreadNextId = (spreadId: string): string | null | undefined =>
  useSnapshotStore((s) => s.illustration.sections?.find((sec) => sec.end_spread_id === spreadId)?.next_spread_id);
export const useBranchSetting = (spreadId: string): BranchSetting | undefined =>
  useSnapshotStore((s) => s.illustration.spreads?.find((sp) => sp.id === spreadId)?.branch_setting);
export const useBranches = (spreadId: string): Branch[] =>
  useSnapshotStore((s) => s.illustration.spreads?.find((sp) => sp.id === spreadId)?.branch_setting?.branches ?? EMPTY_BRANCHES);

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
      // Illustration (unified spread CRUD + raw layers)
      setIllustration: s.setIllustration,
      addIllustrationSpread: s.addIllustrationSpread,
      updateIllustrationSpread: s.updateIllustrationSpread,
      deleteIllustrationSpread: s.deleteIllustrationSpread,
      reorderIllustrationSpreads: s.reorderIllustrationSpreads,
      addRawImage: s.addRawImage,
      updateRawImage: s.updateRawImage,
      deleteRawImage: s.deleteRawImage,
      addRawTextbox: s.addRawTextbox,
      updateRawTextbox: s.updateRawTextbox,
      deleteRawTextbox: s.deleteRawTextbox,
      clearIllustration: s.clearIllustration,
      // Section / Branch / Navigation (merged into IllustrationSlice)
      addSection: s.addSection,
      updateSection: s.updateSection,
      deleteSection: s.deleteSection,
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
      // Retouch (playable layers on illustration.spreads)
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
      addRetouchAutoPic: s.addRetouchAutoPic,
      updateRetouchAutoPic: s.updateRetouchAutoPic,
      deleteRetouchAutoPic: s.deleteRetouchAutoPic,
      addRetouchAudio: s.addRetouchAudio,
      updateRetouchAudio: s.updateRetouchAudio,
      deleteRetouchAudio: s.deleteRetouchAudio,
      addRetouchAutoAudio: s.addRetouchAutoAudio,
      updateRetouchAutoAudio: s.updateRetouchAutoAudio,
      deleteRetouchAutoAudio: s.deleteRetouchAutoAudio,
      addRetouchAnimation: s.addRetouchAnimation,
      updateRetouchAnimation: s.updateRetouchAnimation,
      deleteRetouchAnimation: s.deleteRetouchAnimation,
      deleteRetouchAnimationsByTargetId: s.deleteRetouchAnimationsByTargetId,
      reorderRetouchAnimations: s.reorderRetouchAnimations,
      // Composites (edition-aware wrapper)
      addRetouchComposite: s.addRetouchComposite,
      updateRetouchComposite: s.updateRetouchComposite,
      deleteRetouchComposite: s.deleteRetouchComposite,
      addVariantToComposite: s.addVariantToComposite,
      removeVariantFromComposite: s.removeVariantFromComposite,
      // Quiz (QuizSlice — type-discriminated quizzes + validation-as-state)
      addQuiz: s.addQuiz,
      updateQuiz: s.updateQuiz,
      deleteQuiz: s.deleteQuiz,
      upsertQuizLocale: s.upsertQuizLocale,
      deleteQuizLocale: s.deleteQuizLocale,
      updateQuizAnswerSetting: s.updateQuizAnswerSetting,
      updateQuizContainer: s.updateQuizContainer,
      setItemContainerStyle: s.setItemContainerStyle,
      updateItemContainerStyle: s.updateItemContainerStyle,
      addQuizItem: s.addQuizItem,
      updateQuizItem: s.updateQuizItem,
      deleteQuizItem: s.deleteQuizItem,
      reorderQuizItems: s.reorderQuizItems,
      upsertQuizItemLocale: s.upsertQuizItemLocale,
      deleteQuizItemLocale: s.deleteQuizItemLocale,
      addQuizPair: s.addQuizPair,
      deleteQuizPair: s.deleteQuizPair,
      clearQuizPairs: s.clearQuizPairs,
      addQuizTargetZone: s.addQuizTargetZone,
      updateQuizTargetZone: s.updateQuizTargetZone,
      deleteQuizTargetZone: s.deleteQuizTargetZone,
      addQuizDecorImage: s.addQuizDecorImage,
      updateQuizDecorImage: s.updateQuizDecorImage,
      deleteQuizDecorImage: s.deleteQuizDecorImage,
      revalidateQuiz: s.revalidateQuiz,
      clearQuizValidation: s.clearQuizValidation,
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
      // Characters
      setCharacters: s.setCharacters,
      addCharacter: s.addCharacter,
      updateCharacter: s.updateCharacter,
      deleteCharacter: s.deleteCharacter,
      reorderCharacters: s.reorderCharacters,
      addCharacterVariant: s.addCharacterVariant,
      updateCharacterVariant: s.updateCharacterVariant,
      deleteCharacterVariant: s.deleteCharacterVariant,
      updateCharacterVoiceSetting: s.updateCharacterVoiceSetting,
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
      // Sketch (entity-level CRUD, keyed by kind)
      setSketchEntities: s.setSketchEntities,
      upsertSketchEntity: s.upsertSketchEntity,
      removeSketchEntity: s.removeSketchEntity,
      setSketchEntityMediaUrl: s.setSketchEntityMediaUrl,
      upsertSketchVariant: s.upsertSketchVariant,
      // Sketch generate job (sequential entity-sheet generation)
      startSketchGenerateJob: s.startSketchGenerateJob,
      cancelSketchGenerateJob: s.cancelSketchGenerateJob,
      dismissSketchGenerateJob: s.dismissSketchGenerateJob,
      // Sketch spread generate job (sequential spread-image generation)
      startSketchSpreadGenerateJob: s.startSketchSpreadGenerateJob,
      cancelSketchSpreadGenerateJob: s.cancelSketchSpreadGenerateJob,
      dismissSketchSpreadGenerateJob: s.dismissSketchSpreadGenerateJob,
      // Sketch (spread-level CRUD — sketch-spread creative space)
      setSketch: s.setSketch,
      setSketchSpreads: s.setSketchSpreads,
      addSketchSpread: s.addSketchSpread,
      deleteSketchSpread: s.deleteSketchSpread,
      reorderSketchSpreads: s.reorderSketchSpreads,
      addSketchSpreadImageVersion: s.addSketchSpreadImageVersion,
      selectSketchSpreadImageVersion: s.selectSketchSpreadImageVersion,
      updateSketchPageArtDirection: s.updateSketchPageArtDirection,
      updateSketchTextbox: s.updateSketchTextbox,
      deleteSketchTextbox: s.deleteSketchTextbox,
      // Meta
      setMeta: s.setMeta,
      markDirty: s.markDirty,
      markClean: s.markClean,
      setSaving: s.setSaving,
      setSaveError: s.setSaveError,
      // Image Tasks
      startGenerateTask: s.startGenerateTask,
      startEditTask: s.startEditTask,
      addUploadedIllustration: s.addUploadedIllustration,
      dismissTask: s.dismissTask,
      clearAllTasks: s.clearAllTasks,
      // Top-level
      initSnapshot: s.initSnapshot,
      resetSnapshot: s.resetSnapshot,
      fetchSnapshot: s.fetchSnapshot,
      saveSnapshot: s.saveSnapshot,
      autoSaveSnapshot: s.autoSaveSnapshot,
      flushSnapshot: s.flushSnapshot,
    })),
  );
