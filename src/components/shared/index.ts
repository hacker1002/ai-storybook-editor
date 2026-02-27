// index.ts - Barrel exports for shared components

// Components
export { EditableTextbox } from './editable-textbox';
export { EditableObject } from './editable-object';

// Types
export type {
  Point,
  Geometry,
  Typography,
  Fill,
  Outline,
  SpreadObject,
  PageData,
  SpreadImage,
  SpreadTextbox,
  SpreadAnimation,
  BaseSpread,
} from './types';

// Constants
export { COLORS, CANVAS, Z_INDEX } from './constants';

// Utils
export {
  toPixel,
  toPercent,
  mouseToCanvasPercent,
  calculateDelta,
  clamp,
  getScaledDimensions,
  geometryToScreenRect,
} from './utils/coordinate-utils';

// Hooks
export { useToolbarPosition } from './hooks/use-toolbar-position';
export type { ToolbarPosition } from './hooks/use-toolbar-position';
