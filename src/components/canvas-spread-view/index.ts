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
export { EditableTextbox, EditableObject } from '../shared';
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
  SpreadObject,
  PageData,
  Geometry,
  Point,
  Typography,
  Fill,
  Outline,
  SelectedElement,

  // Context types
  ImageItemContext,
  TextItemContext,
  ObjectItemContext,
  PageToolbarContext,
  ImageToolbarContext,
  TextToolbarContext,
  ObjectToolbarContext,

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
  buildObjectContext,
  buildViewOnlyImageContext,
  buildViewOnlyTextContext,
  buildViewOnlyObjectContext,
} from './utils/context-builders';

// Constants
export { CANVAS, ZOOM, COLUMNS, SELECTION, Z_INDEX, THUMBNAIL, COLORS } from './constants';
