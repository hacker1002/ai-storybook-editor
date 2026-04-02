// spread-constants.ts - Shared domain constants used across canvas and playable spread views
// Centralized from components/shared/constants.ts

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
  SELECTION_FRAME: 800,
} as const;

/**
 * Layer z-index ranges for canvas items.
 * Items within same layer can be reordered via drag; cross-layer drag is blocked.
 *
 * Layer 0: pages (z-index = 0, non-draggable background)
 * Layer 1: image + video (z-index 1..500)
 * Layer 2: shape + audio + quiz (z-index 501..600)
 * Layer 3: textbox (z-index 601..700)
 */
export const LAYER_CONFIG = {
  MEDIA: {
    min: 1,
    max: 500,
    label: "Pictorial",
    types: ["image", "video"] as const,
  },
  OBJECTS: {
    min: 501,
    max: 600,
    label: "Mix",
    types: ["shape", "audio", "quiz"] as const,
  },
  TEXT: { min: 601, max: 700, label: "Text", types: ["textbox"] as const },
} as const;

/** Ordered from top (highest z-index) to bottom */
export const LAYER_ORDER = [
  LAYER_CONFIG.TEXT,
  LAYER_CONFIG.OBJECTS,
  LAYER_CONFIG.MEDIA,
] as const;

export type LayerKey = keyof typeof LAYER_CONFIG;

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

export const THUMBNAIL = {
  SMALL_WIDTH: 100,
  GAP: 8,
} as const;
