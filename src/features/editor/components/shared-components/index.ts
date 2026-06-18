// index.ts - Barrel exports for shared components used across editor component groups

// Components
export { EditableTextbox } from './editable-textbox';
export { EditableImage } from './editable-image';
export { resolveEffectiveImageUrl } from './resolve-effective-image-url';
export { EditableShape } from './editable-shape';
export { EditableVideo } from './editable-video';
export { EditableAudio } from './editable-audio';
export { EditableAutoAudio } from './editable-auto-audio';
export { EditableAutoPic } from './editable-auto-pic';
export { EditableQuiz } from './editable-quiz';
export { GenerateImageModal } from './generate-image-modal';
export { ExtractImageModal } from './extract-image-modal';
export type { ExtractResult, ExtractTabKey } from './extract-image-modal';
export { EditImageModal } from './edit-image-modal';
export { EraseImageModal } from './erase-image-modal';
export { CropImageModal } from './crop-image-modal';
export type { CropCreateResult } from './crop-image-modal-parts';
export { EditAudioModal } from './edit-audio-modal';
export { PromptPanel } from './prompt-panel';
export { GenerateNarrationModal } from './generate-narration-modal';
export { SoundLibraryModal } from './sound-library-modal';
export type { LibrarySound } from './sound-library-modal';
export { clampGeometry, computeGeometryOnMediaReplace, GeometryInput, GeometrySection, ReadOnlyGeometrySection, ToolbarIconButton } from './shared-toolbar-components';
export type { GeometryReplaceInput } from './shared-toolbar-components';
export { ShapeToolbar } from './shape-toolbar';
export { CreateAssetDialog } from './create-asset-dialog';
export type { CreateAssetDialogProps } from './create-asset-dialog';
export { EditImagePopover } from './edit-image-popover';
export type { EditImagePopoverProps, EditImagePopoverReference } from './edit-image-popover';
