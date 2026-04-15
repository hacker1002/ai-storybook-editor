import type { ManuscriptDoc, SnapshotMeta, SyncState, DocType } from '@/types/editor';
import type { ManuscriptDummy, DummySpread } from '@/types/dummy';
import type { IllustrationData, Section, Branch, BranchSetting, BranchLocalizedContent } from '@/types/illustration-types';
import type { Prop, PropVariant, PropSound, CropSheet } from '@/types/prop-types';
import type { Character, CharacterVariant, CharacterVoice } from '@/types/character-types';
import type { Stage, StageVariant, StageSound } from '@/types/stage-types';
import type {
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAnimatedPic,
  SpreadAudio,
  SpreadQuiz,
  SpreadQuizLocalized,
  SpreadAnimation,
  QuizAnswerSetting,
  QuizContainer,
  ItemContainerRole,
  ItemContainerStyle,
  QuizItem,
  QuizItemContent,
  QuizPair,
  QuizTargetZone,
  QuizDecorImage,
} from '@/types/spread-types';

// ============================================================================
// QuizSlice — validation-as-state + type-discriminated CRUD
// ============================================================================

export type QuizValidationCode =
  | 'wrong_type'
  | 'item_not_found'
  | 'zone_not_found'
  | 'fk_violation'
  | 'relation_violation'
  | 'correct_answer_count'
  | 'sequence_gap'
  | 'hotspot_no_zones'
  | 'hotspot_no_images'
  | 'source_target_role';

export interface QuizValidationIssue {
  code: QuizValidationCode;
  message: string;
  severity: 'error' | 'warning';
  context?: Record<string, unknown>;
}

export interface QuizSlice {
  // --- Own state ---
  quizValidationErrors: Record<string, QuizValidationIssue[]>;

  // --- Quiz-level CRUD ---
  addQuiz: (spreadId: string, quiz: SpreadQuiz) => void;
  updateQuiz: (
    spreadId: string,
    quizId: string,
    updates: Partial<Omit<SpreadQuiz, 'id' | 'type'>>,
  ) => void;
  deleteQuiz: (spreadId: string, quizId: string) => void;

  // --- Quiz-level locale (question + audio_url) ---
  upsertQuizLocale: (
    spreadId: string,
    quizId: string,
    languageKey: string,
    content: SpreadQuizLocalized,
  ) => void;
  deleteQuizLocale: (spreadId: string, quizId: string, languageKey: string) => void;

  // --- answer_setting / quiz_container ---
  updateQuizAnswerSetting: (
    spreadId: string,
    quizId: string,
    updates: Partial<QuizAnswerSetting>,
  ) => void;
  updateQuizContainer: (
    spreadId: string,
    quizId: string,
    updates: Partial<QuizContainer>,
  ) => void;

  // --- item_container (per-role style) ---
  setItemContainerStyle: (
    spreadId: string,
    quizId: string,
    role: ItemContainerRole,
    style: ItemContainerStyle,
  ) => void;
  updateItemContainerStyle: (
    spreadId: string,
    quizId: string,
    role: ItemContainerRole,
    updates: Partial<ItemContainerStyle>,
  ) => void;

  // --- elements.items[] ---
  addQuizItem: (spreadId: string, quizId: string, item: QuizItem) => void;
  updateQuizItem: (
    spreadId: string,
    quizId: string,
    itemId: string,
    updates: Partial<QuizItem>,
  ) => void;
  deleteQuizItem: (spreadId: string, quizId: string, itemId: string) => void;
  reorderQuizItems: (
    spreadId: string,
    quizId: string,
    fromIndex: number,
    toIndex: number,
  ) => void;
  upsertQuizItemLocale: (
    spreadId: string,
    quizId: string,
    itemId: string,
    languageKey: string,
    content: QuizItemContent,
  ) => void;
  deleteQuizItemLocale: (
    spreadId: string,
    quizId: string,
    itemId: string,
    languageKey: string,
  ) => void;

  // --- elements.pairs[] (type 1) ---
  addQuizPair: (spreadId: string, quizId: string, pair: QuizPair) => void;
  deleteQuizPair: (spreadId: string, quizId: string, pairIndex: number) => void;
  clearQuizPairs: (spreadId: string, quizId: string) => void;

  // --- elements.target_zones[] (type 3, 4) ---
  addQuizTargetZone: (
    spreadId: string,
    quizId: string,
    zone: QuizTargetZone,
  ) => void;
  updateQuizTargetZone: (
    spreadId: string,
    quizId: string,
    zoneId: string,
    updates: Partial<QuizTargetZone>,
  ) => void;
  deleteQuizTargetZone: (
    spreadId: string,
    quizId: string,
    zoneId: string,
  ) => void;

  // --- elements.images[] (type 3, 4 decorative) ---
  addQuizDecorImage: (
    spreadId: string,
    quizId: string,
    image: QuizDecorImage,
  ) => void;
  updateQuizDecorImage: (
    spreadId: string,
    quizId: string,
    imageIndex: number,
    updates: Partial<QuizDecorImage>,
  ) => void;
  deleteQuizDecorImage: (
    spreadId: string,
    quizId: string,
    imageIndex: number,
  ) => void;

  // --- Validation utilities ---
  revalidateQuiz: (spreadId: string, quizId: string) => void;
  clearQuizValidation: (quizId: string) => void;
}

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
  autoSaveSnapshot: () => Promise<void>;
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

export interface AddItemOptions {
  insertAfterId?: string;
}

export interface IllustrationSlice {
  illustration: IllustrationData;

  setIllustration: (data: IllustrationData) => void;

  // Spread CRUD (unified — single set of spreads for both phases)
  addIllustrationSpread: (spread: BaseSpread) => void;
  updateIllustrationSpread: (spreadId: string, updates: Partial<BaseSpread>) => void;
  deleteIllustrationSpread: (spreadId: string) => void;
  reorderIllustrationSpreads: (fromIndex: number, toIndex: number) => void;

  // Raw Images (illustration phase, player_visible always false)
  addRawImage: (spreadId: string, image: SpreadImage, options?: AddItemOptions) => void;
  updateRawImage: (spreadId: string, imageId: string, updates: Partial<SpreadImage>) => void;
  deleteRawImage: (spreadId: string, imageId: string) => void;

  // Raw Textboxes (illustration phase, player_visible always false)
  addRawTextbox: (spreadId: string, textbox: SpreadTextbox, options?: AddItemOptions) => void;
  updateRawTextbox: (spreadId: string, textboxId: string, updates: Partial<SpreadTextbox>) => void;
  deleteRawTextbox: (spreadId: string, textboxId: string) => void;

  clearIllustration: () => void;

  // Section CRUD (merged into IllustrationSlice)
  addSection: (section: Section) => void;
  updateSection: (sectionId: string, updates: Partial<Omit<Section, 'id'>>) => void;
  deleteSection: (sectionId: string) => void;

  // Navigation (stored on section, not spread)
  setNextSpreadId: (sectionId: string, nextSpreadId: string | null) => void;
  clearNextSpreadId: (sectionId: string) => void;

  // Branch Setting
  setBranchSetting: (spreadId: string, setting: BranchSetting) => void;
  clearBranchSetting: (spreadId: string) => void;

  // Branch CRUD
  addBranch: (spreadId: string, branch: Branch) => void;
  updateBranch: (spreadId: string, branchIndex: number, updates: Partial<Branch>) => void;
  deleteBranch: (spreadId: string, branchIndex: number) => void;
  reorderBranches: (spreadId: string, fromIndex: number, toIndex: number) => void;

  // Localization
  updateBranchSettingLocale: (spreadId: string, languageKey: string, content: BranchLocalizedContent) => void;
  deleteBranchSettingLocale: (spreadId: string, languageKey: string) => void;
  updateBranchLocale: (spreadId: string, branchIndex: number, languageKey: string, content: BranchLocalizedContent) => void;
  deleteBranchLocale: (spreadId: string, branchIndex: number, languageKey: string) => void;
}

// RetouchSlice — no own state, operates on playable layers in state.illustration.spreads[]
export interface RetouchSlice {
  addRetouchImage: (spreadId: string, image: SpreadImage, options?: AddItemOptions) => void;
  updateRetouchImage: (spreadId: string, imageId: string, updates: Partial<SpreadImage>) => void;
  deleteRetouchImage: (spreadId: string, imageId: string) => void;

  addRetouchTextbox: (spreadId: string, textbox: SpreadTextbox, options?: AddItemOptions) => void;
  updateRetouchTextbox: (spreadId: string, textboxId: string, updates: Partial<SpreadTextbox>) => void;
  deleteRetouchTextbox: (spreadId: string, textboxId: string) => void;

  addRetouchShape: (spreadId: string, shape: SpreadShape, options?: AddItemOptions) => void;
  updateRetouchShape: (spreadId: string, shapeId: string, updates: Partial<SpreadShape>) => void;
  deleteRetouchShape: (spreadId: string, shapeId: string) => void;

  addRetouchVideo: (spreadId: string, video: SpreadVideo, options?: AddItemOptions) => void;
  updateRetouchVideo: (spreadId: string, videoId: string, updates: Partial<SpreadVideo>) => void;
  deleteRetouchVideo: (spreadId: string, videoId: string) => void;

  addRetouchAnimatedPic: (spreadId: string, animatedPic: SpreadAnimatedPic, options?: AddItemOptions) => void;
  updateRetouchAnimatedPic: (spreadId: string, animatedPicId: string, updates: Partial<SpreadAnimatedPic>) => void;
  deleteRetouchAnimatedPic: (spreadId: string, animatedPicId: string) => void;

  addRetouchAudio: (spreadId: string, audio: SpreadAudio, options?: AddItemOptions) => void;
  updateRetouchAudio: (spreadId: string, audioId: string, updates: Partial<SpreadAudio>) => void;
  deleteRetouchAudio: (spreadId: string, audioId: string) => void;

  addRetouchAnimation: (spreadId: string, animation: SpreadAnimation) => void;
  updateRetouchAnimation: (spreadId: string, animationIndex: number, updates: Partial<SpreadAnimation>) => void;
  deleteRetouchAnimation: (spreadId: string, animationIndex: number) => void;
  deleteRetouchAnimationsByTargetId: (spreadId: string, targetId: string) => void;
  reorderRetouchAnimations: (spreadId: string, fromIndex: number, toIndex: number) => void;
}

export interface PropsSlice {
  props: Prop[];
  setProps: (props: Prop[]) => void;
  addProp: (prop: Prop) => void;
  updateProp: (key: string, updates: Partial<Prop>) => void;
  deleteProp: (key: string) => void;
  reorderProps: (fromIndex: number, toIndex: number) => void;
  addPropVariant: (propKey: string, variant: PropVariant) => void;
  updatePropVariant: (propKey: string, variantKey: string, updates: Partial<PropVariant>) => void;
  deletePropVariant: (propKey: string, variantKey: string) => void;
  addPropSound: (propKey: string, sound: PropSound) => void;
  updatePropSound: (propKey: string, soundKey: string, updates: Partial<PropSound>) => void;
  deletePropSound: (propKey: string, soundKey: string) => void;
  addPropCropSheet: (propKey: string, cropSheet: CropSheet) => void;
  updatePropCropSheet: (propKey: string, cropSheetIndex: number, updates: Partial<CropSheet>) => void;
  deletePropCropSheet: (propKey: string, cropSheetIndex: number) => void;
}

export interface CharactersSlice {
  characters: Character[];
  setCharacters: (characters: Character[]) => void;
  addCharacter: (character: Character) => void;
  updateCharacter: (key: string, updates: Partial<Character>) => void;
  deleteCharacter: (key: string) => void;
  reorderCharacters: (fromIndex: number, toIndex: number) => void;
  addCharacterVariant: (key: string, variant: CharacterVariant) => void;
  updateCharacterVariant: (key: string, variantKey: string, updates: Partial<CharacterVariant>) => void;
  deleteCharacterVariant: (key: string, variantKey: string) => void;
  addCharacterVoice: (key: string, voice: CharacterVoice) => void;
  updateCharacterVoice: (key: string, voiceKey: string, updates: Partial<CharacterVoice>) => void;
  deleteCharacterVoice: (key: string, voiceKey: string) => void;
  addCharacterCropSheet: (key: string, cropSheet: CropSheet) => void;
  updateCharacterCropSheet: (key: string, cropSheetIndex: number, updates: Partial<CropSheet>) => void;
  deleteCharacterCropSheet: (key: string, cropSheetIndex: number) => void;
}

export interface StagesSlice {
  stages: Stage[];
  setStages: (stages: Stage[]) => void;
  addStage: (stage: Stage) => void;
  updateStage: (key: string, updates: Partial<Stage>) => void;
  deleteStage: (key: string) => void;
  reorderStages: (fromIndex: number, toIndex: number) => void;
  addStageVariant: (key: string, variant: StageVariant) => void;
  updateStageVariant: (key: string, variantKey: string, updates: Partial<StageVariant>) => void;
  deleteStageVariant: (key: string, variantKey: string) => void;
  addStageSound: (key: string, sound: StageSound) => void;
  updateStageSound: (key: string, soundKey: string, updates: Partial<StageSound>) => void;
  deleteStageSound: (key: string, soundKey: string) => void;
}

// --- Image Task Types (ephemeral, not persisted to DB) ---

/** Entity types that support background image generation/editing */
export type ImageTaskEntityType = 'prop' | 'character' | 'stage' | 'retouch_image' | 'illustration_image';

/** Identifies the target entity + child for an image task */
export interface ImageTaskTarget {
  entityType: ImageTaskEntityType;
  entityKey: string;    // prop key | character key | stage key
  entityName: string;   // prop name | character name | stage name
  childKey: string;     // variant key
  childName: string;    // variant name
}

export interface ImageTask extends ImageTaskTarget {
  id: string;
  taskType: 'generate' | 'edit';
  status: 'pending' | 'completed' | 'error';
  error?: string;
  createdAt: string;
  completedAt?: string;
}

/** Shared reference images param */
type ReferenceImages = Array<{ base64Data: string; mimeType: string }>;

// --- Discriminated union for startGenerateTask ---
// Each variant carries the structured data its illustration API needs.

interface CharacterBaseGenerateParams extends ImageTaskTarget {
  entityType: 'character';
  isBase: true;
  basicInfo?: {
    description?: string;
    gender?: string;
    age?: string;
    category_id?: string;
    role?: string;
  };
  personality?: {
    core_essence?: string;
    flaws?: string;
    emotions?: string;
    reactions?: string;
    desires?: string;
    likes?: string;
    fears?: string;
    contradictions?: string;
  };
  baseVariant: {
    appearance?: {
      height?: number;
      hair?: string;
      eyes?: string;
      face?: string;
      build?: string;
    };
    visual_description: string;
  };
  artStyleDescription: string;
  referenceImages?: ReferenceImages;
}

interface CharacterVariantGenerateParams extends ImageTaskTarget {
  entityType: 'character';
  isBase: false;
  variantKey: string;
  variantAppearance?: {
    height?: number;
    hair?: string;
    eyes?: string;
    face?: string;
    build?: string;
  };
  variantVisualDescription: string;
  baseVariantImageUrl: string;
  artStyleDescription: string;
  additionalReferenceImages?: ReferenceImages;
}

interface PropBaseGenerateParams extends ImageTaskTarget {
  entityType: 'prop';
  isBase: true;
  propKey: string;
  propName?: string;
  propType?: 'narrative' | 'anchor';
  categoryName?: string;
  categoryType?: number;
  baseStateVisualDescription: string;
  artStyleDescription: string;
  referenceImages?: ReferenceImages;
}

interface PropVariantGenerateParams extends ImageTaskTarget {
  entityType: 'prop';
  isBase: false;
  variantKey: string;
  variantVisualDescription: string;
  basePropImageUrl: string;
  artStyleDescription: string;
  additionalReferenceImages?: ReferenceImages;
}

interface StageBaseGenerateParams extends ImageTaskTarget {
  entityType: 'stage';
  isBase: true;
  stageKey: string;
  stageName?: string;
  locationDescription?: string;
  eraDescription?: string;
  baseSetting: {
    visual_description: string;
    temporal?: { era?: string; season?: string; weather?: string; time_of_day?: string };
    sensory?: { atmosphere?: string; soundscape?: string; lighting?: string; color_palette?: string };
    emotional?: { mood?: string };
  };
  artStyleDescription: string;
  referenceImages?: ReferenceImages;
}

interface StageVariantGenerateParams extends ImageTaskTarget {
  entityType: 'stage';
  isBase: false;
  variantKey: string;
  variantVisualDescription: string;
  variantTemporal?: { era?: string; season?: string; weather?: string; time_of_day?: string };
  variantSensory?: { atmosphere?: string; soundscape?: string; lighting?: string; color_palette?: string };
  variantEmotional?: { mood?: string };
  eraDescription?: string;
  baseStageImageUrl: string;
  artStyleDescription: string;
  additionalReferenceImages?: ReferenceImages;
}

interface SceneGenerateParams extends ImageTaskTarget {
  entityType: 'illustration_image';
  visualDescription: string;
  artStyleDescription: string;
  stageVariantImageUrl?: string;
  referenceImages?: ReferenceImages;
  aspectRatio?: string;
}

export type StartGenerateTaskParams =
  | CharacterBaseGenerateParams
  | CharacterVariantGenerateParams
  | PropBaseGenerateParams
  | PropVariantGenerateParams
  | StageBaseGenerateParams
  | StageVariantGenerateParams
  | SceneGenerateParams;

export interface StartEditTaskParams extends ImageTaskTarget {
  prompt: string;
  imageUrl: string;
  referenceImages?: ReferenceImages;
  aspectRatio?: string;
}

export interface ImageTaskSlice {
  imageTasks: ImageTask[];
  startGenerateTask: (params: StartGenerateTaskParams) => void;
  startEditTask: (params: StartEditTaskParams) => void;
  dismissTask: (taskId: string) => void;
  clearAllTasks: () => void;
}

export type SnapshotStore = DocsSlice & MetaSlice & FetchSlice & DummiesSlice & IllustrationSlice & RetouchSlice & QuizSlice & PropsSlice & CharactersSlice & StagesSlice & ImageTaskSlice & {
  initSnapshot: (data: { docs?: ManuscriptDoc[]; dummies?: ManuscriptDummy[]; illustration?: IllustrationData; props?: Prop[]; characters?: Character[]; stages?: Stage[]; meta?: Partial<SnapshotMeta> }) => void;
  resetSnapshot: () => void;
};
