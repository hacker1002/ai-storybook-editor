// Public barrel for the shared audio-library feature.

export type {
  AudioResource,
  AudioRow,
  AudioSource,
  AudioType,
  AudioFilterState,
  AudioActiveModal,
  AudioTableName,
} from './types';

export {
  applyFilters,
  audioTags,
  distinctTags,
  durationBoundsOf,
  matchSearch,
  normalizeTags,
} from './utils/audio-filters';
export { mapAudioRow } from './utils/audio-mapper';
export { SOURCE_BADGE, formatDurationMs, formatDuration } from './utils/audio-labels';
export { parseStoragePathFromUrl } from './utils/audio-storage-path-parser';
export {
  deleteAudioRowAndCleanup,
  type DeleteAudioRowAndCleanupOptions,
  type DeleteAudioRowAndCleanupResult,
} from './utils/delete-audio-row-and-cleanup';

export {
  useSingletonAudioPlayer,
  type SingletonAudioPlayer,
} from './hooks/use-singleton-audio-player';
export {
  useGenerateModalFlow,
  type GenerateModalFlowOptions,
  type GenerateModalFlowReturn,
  type GenerateModalStep,
  type GenerateOutcome,
  type ModalError,
  type ValidationResult,
} from './hooks/use-generate-modal-flow';
export {
  createAudioStore,
  buildAudioStoreHooks,
  type AudioPatch,
  type AudioStoreState,
  type CreateAudioStoreOptions,
} from './hooks/create-audio-store';

export {
  AudioLibraryHeader,
  type AudioLibraryHeaderProps,
} from './components/audio-library-header';
export {
  AudioLibraryToolbar,
  type AudioLibraryToolbarProps,
} from './components/audio-library-toolbar';
export {
  AudioLibraryList,
  type AudioLibraryListProps,
} from './components/audio-library-list';
export {
  AudioLibraryRow,
  type AudioLibraryRowProps,
} from './components/audio-library-row';
export { DurationFilter, type DurationFilterProps } from './components/duration-filter';
export { TagsFilter, type TagsFilterProps } from './components/tags-filter';
export {
  EditAudioModal,
  type EditAudioModalProps,
} from './components/edit-audio-modal';
export {
  DeleteAudioDialog,
  type DeleteAudioDialogProps,
} from './components/delete-audio-dialog';
export {
  UploadAudioModal,
  type UploadAudioModalProps,
} from './components/upload-audio-modal/upload-audio-modal';
