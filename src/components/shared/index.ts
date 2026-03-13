// index.ts - Barrel exports for shared components

// Components
export { EditableTextbox } from './editable-textbox';

// Types
export type {
  Point,
  Geometry,
  Typography,
  Fill,
  Outline,
  ShapeFill,
  ShapeOutline,
  SpreadShape,
  SpreadVideo,
  SpreadAudio,
  SpreadQuiz,
  SpreadQuizOption,
  SpreadQuizContent,
  SpreadQuizOptionContent,
  SpreadItemMediaType,
  PageData,
  SpreadImage,
  SpreadTextbox,
  SpreadTextboxContent,
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
export { getFirstTextboxKey } from './utils/textbox-helpers';

// Hooks
export { useToolbarPosition } from './hooks/use-toolbar-position';
export type { ToolbarPosition } from './hooks/use-toolbar-position';
