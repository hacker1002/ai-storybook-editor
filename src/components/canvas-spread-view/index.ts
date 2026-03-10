// index.ts - Barrel exports for CanvasSpreadView component family

// Hooks
export { useToolbarPosition } from './hooks/use-toolbar-position';

// Main component
export { CanvasSpreadView } from './canvas-spread-view';

// Child components
export { SpreadViewHeader } from './spread-view-header';
export { SpreadEditorPanel } from './spread-editor-panel';
export { SpreadThumbnailList } from './spread-thumbnail-list';
export { SpreadThumbnail } from './spread-thumbnail';
export { NewSpreadButton, type SpreadType } from './new-spread-button';

// Utility components
export { EditableImage } from './editable-image';
export { EditableShape } from './editable-shape';
export { EditableVideo } from './editable-video';
export { EditableAudio } from './editable-audio';
export { GenerateImageModal } from './generate-image-modal';
export { EditableTextbox } from '../shared';
export { SelectionFrame } from './selection-frame';
export { PageItem } from './page-item';

// Types
export type {
  // Core types
  ViewMode,
  ItemType,
  ThumbnailListLayout,
  ResizeHandle,
  TextureOption,

  // Data types
  BaseSpread,
  SpreadImage,
  SpreadTextbox,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  ShapeFill,
  ShapeOutline,
  PageData,
  Geometry,
  Point,
  Typography,
  SelectedElement,

  // Context types
  ImageItemContext,
  TextItemContext,
  ShapeItemContext,
  VideoItemContext,
  AudioItemContext,
  PageToolbarContext,
  ImageToolbarContext,
  TextToolbarContext,
  ShapeToolbarContext,
  VideoToolbarContext,
  AudioToolbarContext,

  // Config types
  LayoutOption,

  // Action types
  SpreadItemActionUnion,
  OnUpdateSpreadItemFn,
} from './types';

// Utilities
export {
  toPixel,
  toPercent,
  mouseToCanvasPercent,
  clamp,
  getScaledDimensions,
  geometryToScreenRect,
} from './utils/coordinate-utils';

export {
  isOnLeftPage,
  isOnRightPage,
  applyDragDelta,
  applyResizeDelta,
  applyNudge,
} from './utils/geometry-utils';

export {
  buildImageContext,
  buildTextContext,
  buildTextToolbarContext,
  buildShapeContext,
  buildVideoContext,
  buildAudioContext,
  buildViewOnlyImageContext,
  buildViewOnlyTextContext,
  buildViewOnlyShapeContext,
  buildViewOnlyVideoContext,
  buildViewOnlyAudioContext,
} from './utils/context-builders';

// Constants
export { CANVAS, ZOOM, COLUMNS, SELECTION, Z_INDEX, THUMBNAIL, COLORS } from './constants';
