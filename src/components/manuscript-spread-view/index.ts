// index.ts - Barrel exports for ManuscriptSpreadView component family

// Hooks
export { useToolbarPosition } from './hooks/use-toolbar-position';

// Main component
export { ManuscriptSpreadView } from './manuscript-spread-view';

// Child components
export { SpreadViewHeader } from './spread-view-header';
export { SpreadEditorPanel } from './spread-editor-panel';
export { SpreadThumbnailList } from './spread-thumbnail-list';
export { SpreadThumbnail } from './spread-thumbnail';
export { NewSpreadButton } from './new-spread-button';

// Utility components
export { EditableImage } from './editable-image';
export { EditableTextbox } from './editable-textbox';
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
  SpreadAnimation,
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
  AnimationItemContext,
  PageToolbarContext,
  ImageToolbarContext,
  TextToolbarContext,

  // Config types
  LayoutOption,
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
  buildViewOnlyImageContext,
  buildViewOnlyTextContext,
} from './utils/context-builders';

// Constants
export { CANVAS, ZOOM, COLUMNS, SELECTION, Z_INDEX, THUMBNAIL, COLORS } from './constants';
