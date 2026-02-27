// constants.ts - Shared constants used across canvas and playable spread views

export const COLORS = {
  PLACEHOLDER_BG: "#f5f5f5",
  PLACEHOLDER_BORDER: "#e0e0e0",
  HOVER_OUTLINE: "#bdbdbd",
  EDIT_MODE_BG: "rgba(33, 150, 243, 0.05)",
  PLACEHOLDER_TEXT: "#9e9e9e",
  SELECTION: "#2196F3",
} as const;

export const CANVAS = {
  BASE_WIDTH: 800,
  BASE_HEIGHT: 600,
  ASPECT_RATIO: 4 / 3,
  MIN_ELEMENT_SIZE: 5,
  NUDGE_STEP: 1,
  NUDGE_STEP_SHIFT: 5,
} as const;

export const Z_INDEX = {
  PAGE_BACKGROUND: -999,
  IMAGE_BASE: 0,
  TEXTBOX_BASE: 1000,
  OBJECT_BASE: 2000,
  SELECTION_FRAME: 10000,
} as const;
