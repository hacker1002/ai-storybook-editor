// spread-constants.ts - Shared domain constants used across canvas and playable spread views
// Centralized from components/shared/constants.ts

export const COLORS = {
  PLACEHOLDER_BG: "#f5f5f5",
  PLACEHOLDER_BORDER: "#e0e0e0",
  HOVER_OUTLINE: "#bdbdbd",
  EDIT_MODE_BG: "rgba(33, 150, 243, 0.05)",
  PLACEHOLDER_TEXT: "#9e9e9e",
  SELECTION: "#2196F3",
  // Persistent item borders (visible when not selected)
  ITEM_BORDER_IMAGE: "rgba(234, 179, 8, 0.75)",    // yellow, solid
  ITEM_BORDER_TEXTBOX: "rgba(180, 185, 195, 0.85)", // light gray, dashed
  ITEM_BORDER_VIDEO: "rgba(0, 0, 0, 0.22)",         // black muted, solid
  ITEM_BORDER_AUTO_PIC: "rgba(139, 92, 246, 0.5)", // purple, animated pic layer
  ITEM_BORDER_HOVER: "rgba(33, 150, 243, 0.5)",     // light blue hover (lighter than SELECTION)
} as const;

export const CANVAS = {
  MIN_ELEMENT_SIZE: 5,
  NUDGE_STEP: 1,
  NUDGE_STEP_SHIFT: 5,
} as const;

export const Z_INDEX = {
  PAGE_BACKGROUND: -999,
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
    types: ["image", "video", "auto_pic"] as const,
  },
  OBJECTS: {
    min: 501,
    max: 600,
    label: "Mix",
    types: ["shape", "audio", "auto_audio", "quiz"] as const,
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

/**
 * Default title strings for newly-created audio / auto_audio items.
 * Shared by item-creation paths and sound-library overwrite logic so that
 * picking a sound from the library can safely replace the auto-generated
 * placeholder title without clobbering a user-edited one.
 *
 * NOTE: `name` field on SpreadAudio/SpreadAutoAudio is a separate identifier
 * (not user-facing display) and is not touched by the sound-pick flow.
 */
export const AUDIO_DEFAULTS = {
  AUDIO_TITLE: "New Audio",
  AUTO_AUDIO_TITLE: "New Auto Audio",
} as const;

export const DEFAULT_AUDIO_TITLES: ReadonlySet<string> = new Set([
  AUDIO_DEFAULTS.AUDIO_TITLE,
  AUDIO_DEFAULTS.AUTO_AUDIO_TITLE,
]);
