import type { ManuscriptDoc, SnapshotMeta, SyncState, DocType } from '@/types/editor';
import type { ManuscriptDummy, DummySpread } from '@/types/dummy';
import type { RetouchData } from '@/types/retouch-types';
import type { Prop, PropState, PropSound, CropSheet } from '@/types/prop-types';
import type { Character, CharacterVariant, CharacterVoice } from '@/types/character-types';
import type { Stage, StageSetting, StageSound } from '@/types/stage-types';
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
  deleteRetouchAnimationsByTargetId: (spreadId: string, targetId: string) => void;
  reorderRetouchAnimations: (spreadId: string, fromIndex: number, toIndex: number) => void;

  clearRetouch: () => void;
}

export interface PropsSlice {
  props: Prop[];
  setProps: (props: Prop[]) => void;
  addProp: (prop: Prop) => void;
  updateProp: (key: string, updates: Partial<Prop>) => void;
  deleteProp: (key: string) => void;
  reorderProps: (fromIndex: number, toIndex: number) => void;
  addPropState: (propKey: string, state: PropState) => void;
  updatePropState: (propKey: string, stateKey: string, updates: Partial<PropState>) => void;
  deletePropState: (propKey: string, stateKey: string) => void;
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
  addStageSetting: (key: string, setting: StageSetting) => void;
  updateStageSetting: (key: string, settingKey: string, updates: Partial<StageSetting>) => void;
  deleteStageSetting: (key: string, settingKey: string) => void;
  addStageSound: (key: string, sound: StageSound) => void;
  updateStageSound: (key: string, soundKey: string, updates: Partial<StageSound>) => void;
  deleteStageSound: (key: string, soundKey: string) => void;
}

// --- Image Task Types (ephemeral, not persisted to DB) ---

/** Entity types that support background image generation/editing */
export type ImageTaskEntityType = 'prop' | 'character' | 'stage';

/** Identifies the target entity + child for an image task */
export interface ImageTaskTarget {
  entityType: ImageTaskEntityType;
  entityKey: string;    // prop key | character key | stage key
  entityName: string;   // prop name | character name | stage name
  childKey: string;     // state key | variant key | setting key
  childName: string;    // state name | variant name | setting name
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

export interface StartGenerateTaskParams extends ImageTaskTarget {
  description: string;
  referenceImages?: ReferenceImages;
}

export interface StartEditTaskParams extends ImageTaskTarget {
  prompt: string;
  imageUrl: string;
  referenceImages?: ReferenceImages;
}

export interface ImageTaskSlice {
  imageTasks: ImageTask[];
  startGenerateTask: (params: StartGenerateTaskParams) => void;
  startEditTask: (params: StartEditTaskParams) => void;
  dismissTask: (taskId: string) => void;
  clearAllTasks: () => void;
}

export type SnapshotStore = DocsSlice & MetaSlice & FetchSlice & DummiesSlice & RetouchSlice & PropsSlice & CharactersSlice & StagesSlice & ImageTaskSlice & {
  initSnapshot: (data: { docs?: ManuscriptDoc[]; dummies?: ManuscriptDummy[]; retouch?: RetouchData; props?: Prop[]; characters?: Character[]; stages?: Stage[]; meta?: Partial<SnapshotMeta> }) => void;
  resetSnapshot: () => void;
};
