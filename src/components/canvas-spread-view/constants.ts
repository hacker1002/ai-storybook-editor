// constants.ts - Layout and style constants

export const CANVAS = {
  BASE_WIDTH: 800,
  BASE_HEIGHT: 600,
  ASPECT_RATIO: 4 / 3,
  MIN_ELEMENT_SIZE: 5, // percentage
  NUDGE_STEP: 1, // percentage
  NUDGE_STEP_SHIFT: 5, // percentage
} as const;

export const ZOOM = {
  MIN: 25,
  MAX: 200,
  DEFAULT: 100,
  STEP: 5,
} as const;

export const COLUMNS = {
  MIN: 2,
  MAX: 6,
  DEFAULT: 4,
} as const;

export const SELECTION = {
  HANDLE_SIZE: 8,
  ACTIVE_HANDLE_SIZE: 10,
  BORDER_WIDTH: 2,
  COLOR: "#2196F3",
} as const;

export const Z_INDEX = {
  PAGE_BACKGROUND: -999,
  IMAGE_BASE: 0,
  TEXTBOX_BASE: 1000,
  OBJECT_BASE: 2000,
  SELECTION_FRAME: 10000,
} as const;

export const THUMBNAIL = {
  SMALL_SCALE: 0.15,
  MEDIUM_SCALE: 0.25,
  SMALL_SIZE: { width: 100, height: 80 },
  GAP: 8,
} as const;

export const HEADER = {
  HEIGHT: 48,
  TOGGLE_SIZE: 36,
  SLIDER_WIDTH: 120,
  GAP: 8,
} as const;

export const HANDLE_POSITIONS: Record<string, { x: string; y: string }> = {
  nw: { x: "0%", y: "0%" },
  n: { x: "50%", y: "0%" },
  ne: { x: "100%", y: "0%" },
  w: { x: "0%", y: "50%" },
  e: { x: "100%", y: "50%" },
  sw: { x: "0%", y: "100%" },
  s: { x: "50%", y: "100%" },
  se: { x: "100%", y: "100%" },
};

export const HANDLE_CURSORS: Record<string, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  w: "ew-resize",
  e: "ew-resize",
  sw: "nesw-resize",
  s: "ns-resize",
  se: "nwse-resize",
};

// Re-export COLORS from shared
export { COLORS } from '../shared';

export const AVAILABLE_TEXTURES = [
  "paper",
  "canvas",
  "linen",
  "watercolor",
  null,
] as const;
