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
    types: ["image", "video", "auto_pic", "composite"] as const,
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

// === Smart hit-test constants (ADR-029) ===
// Objects creative space — containment-aware hit-test + sticky frame z + dim overlapping.
// Scope: Objects space only; gated by VITE_ENABLE_SMART_HIT_TEST + ObjectsMainView prop.

/** Minimum overlap ratio (small/large) for an item to win containment-override. */
export const HIT_TEST_CONTAINMENT_THRESHOLD = 0.9;

/** Reserved throttle marker; rAF batching is used in practice. */
export const HIT_TEST_MOUSEMOVE_THROTTLE_MS = 16;

/** Opacity applied to items that fully cover the currently-selected item. */
export const DIMMED_BY_OVERLAP_OPACITY = 0.4;

/** Z-index reserved for sticky selection frame + hover preview overlay. */
export const MAX_INTERACTIVE_Z = 9000;

/** Z-index for confirm/alert dialogs raised over a creative-space canvas
 *  (e.g. sketch-spread "Regenerate spreads?"). The shared shadcn AlertDialog/Dialog
 *  ship at z-50, which the canvas item band (LAYER_CONFIG media/objects/text 1–700
 *  + sticky selection frame up to MAX_INTERACTIVE_Z) paints over — the modal mounts
 *  but is occluded by textboxes. Must clear the whole interactive band. Pass to
 *  AlertDialogContent's `zIndex` prop (lifts overlay + content together). */
export const CANVAS_CONFIRM_DIALOG_Z = MAX_INTERACTIVE_Z + 1;

/** Z-index for a portaled dropdown/popover (Radix Select, etc.) rendered INSIDE a
 *  canvas-lifted dialog. Both portal to body as siblings, so the dropdown must sit
 *  ABOVE CANVAS_CONFIRM_DIALOG_Z or it paints behind its own dialog. Still under the
 *  item toolbar portal (9999). */
export const CANVAS_DIALOG_POPOVER_Z = CANVAS_CONFIRM_DIALOG_Z + 1;

/** Pixel delta below which a frame mousedown→mouseup is treated as a pure click. */
export const CLICK_NO_DRAG_THRESHOLD_PX = 3;
