// index.ts - Barrel exports for editor-shared components

// Components
export { EditableTextbox } from './editable-textbox';
export { PromptPanel } from './prompt-panel';

// Types (re-export from centralized)
export type {
  Point, Geometry, Typography, Fill, Outline,
  ShapeFill, ShapeOutline, SpreadShape,
  SpreadVideo, SpreadAudio, SpreadQuiz, SpreadQuizOption,
  SpreadQuizContent, SpreadQuizOptionContent, SpreadItemMediaType,
  PageData, SpreadImage, SpreadTextbox, SpreadTextboxContent,
  SpreadAnimation, BaseSpread,
} from '@/types/spread-types';

// Constants (re-export from centralized)
export { COLORS, CANVAS, Z_INDEX } from '@/constants/spread-constants';

// Utils
export {
  toPixel, toPercent, mouseToCanvasPercent,
  calculateDelta, clamp, getScaledDimensions, geometryToScreenRect,
} from './utils/coordinate-utils';
export { getFirstTextboxKey } from './utils/textbox-helpers';

// Hooks
export { useToolbarPosition } from './hooks/use-toolbar-position';
export type { ToolbarPosition } from './hooks/use-toolbar-position';
