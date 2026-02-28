// constants.ts - Layout and style constants

// Re-export shared constants
export { CANVAS, Z_INDEX, COLORS } from "../shared";

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

export const THUMBNAIL = {
  SMALL_WIDTH: 100,
  GAP: 8,
} as const;

export const HEADER = {
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

export const AVAILABLE_TEXTURES = [
  "paper",
  "canvas",
  "linen",
  "watercolor",
  null,
] as const;
