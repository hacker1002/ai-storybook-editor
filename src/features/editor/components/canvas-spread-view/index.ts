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

// Shared components (re-export from shared-components for backward compatibility)
export {
  EditableImage,
  EditableShape,
  EditableVideo,
  EditableAudio,
  EditableQuiz,
  EditableTextbox,
  GenerateImageModal,
} from '../shared-components';
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
  AutoPicItemContext,
  AutoPicToolbarContext,
  AudioToolbarContext,

  // Config types
  LayoutOption,

  // Action types
  SpreadItemActionUnion,
  OnUpdateSpreadItemFn,
} from '@/types/canvas-types';

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

// Constants - re-exported from centralized @/constants/ for barrel consumers
export { CANVAS, ZOOM, COLUMNS, Z_INDEX, THUMBNAIL, COLORS } from '@/constants/spread-constants';
