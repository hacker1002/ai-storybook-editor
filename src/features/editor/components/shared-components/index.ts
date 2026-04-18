// index.ts - Barrel exports for shared components used across editor component groups

// Components
export { EditableTextbox } from './editable-textbox';
export { EditableImage } from './editable-image';
export { EditableShape } from './editable-shape';
export { EditableVideo } from './editable-video';
export { EditableAudio } from './editable-audio';
export { EditableAnimatedPic } from './editable-animated-pic';
export { EditableQuiz } from './editable-quiz';
export { GenerateImageModal } from './generate-image-modal';
export { EditImageModal } from './edit-image-modal';
export { EraseImageModal } from './erase-image-modal';
export { SplitImageModal } from './split-image-modal';
export type { SplitLayerResult } from './split-image-modal';
export { CropImageModal } from './crop-image-modal';
export type { CropCreateResult } from './crop-image-modal-parts';
export { CropAudioModal } from './crop-audio-modal';
export { PromptPanel } from './prompt-panel';
export { GenerateNarrationModal } from './generate-narration-modal';
export { SoundLibraryModal } from './sound-library-modal';
export type { LibrarySound } from './sound-library-modal';
export { clampGeometry, computeGeometryOnMediaReplace, GeometryInput, GeometrySection, ReadOnlyGeometrySection, MediaIdentitySection, MEDIA_TYPE_OPTIONS, DEFAULT_STATES, ToolbarIconButton } from './shared-toolbar-components';
export type { GeometryReplaceInput } from './shared-toolbar-components';
export { ShapeToolbar } from './shape-toolbar';
export { CreateAssetDialog } from './create-asset-dialog';
export type { CreateAssetDialogProps } from './create-asset-dialog';
