// playable-constants.ts - Cross-boundary constants from playable spread view
// Centralized because animation-constants.ts and demo mocks import these

export const EFFECT_TYPE = {
  PLAY: 1,
  APPEAR: 2,
  FADE_IN: 3,
  FLY_IN: 4,
  FLOAT_IN: 5,
  ZOOM: 6,
  SPIN: 7,
  GROW_SHRINK: 8,
  TEETER: 9,
  TRANSPARENCY: 10,
  READ_ALONG: 11,
  DISAPPEAR: 12,
  FADE_OUT: 13,
  FLY_OUT: 14,
  FLOAT_OUT: 15,
  LINES: 16,
  ARCS: 17,
  FOCUS: 18,
  ZOOM_IN: 19,
} as const;

export const EFFECT_TYPE_NAMES: Record<number, string> = {
  1: "Play",
  2: "Appear",
  3: "Fade In",
  4: "Fly In",
  5: "Float In",
  6: "Zoom",
  7: "Spin",
  8: "Grow/Shrink",
  9: "Teeter",
  10: "Transparency",
  11: "Read-along",
  12: "Disappear",
  13: "Fade Out",
  14: "Fly Out",
  15: "Float Out",
  16: "Lines",
  17: "Arcs",
  18: "Focus",
  19: "Zoom In",
};

// === Camera Animation Defaults (effect types 18, 19) ===
export const CAMERA_DEFAULTS = {
  EASE: "power2.inOut",
  EASE_TIME_MS: 500,
  DURATION_MS: 3000,
  FOCUS_BLUR_PX: 3,
  ZOOM_TRANSFORM_ORIGIN: "0 0",
  ZOOM_DEFAULT_GEOMETRY_W_PCT: 50,
} as const;

// === Zoom Constants (playable header + spread view) ===
export const PLAYABLE_ZOOM = {
  MIN: 25,
  MAX: 200,
  DEFAULT: 100,
  STEP: 5,
} as const;

// === Print/PDF Export DPI + zoom (Feature B — static print render path) ===
// Print renders at 300 DPI; the editor/player canvas baseline is 75 DPI
// (= canvas-math-utils PX_PER_MM ≈ 75/25.4). Font/border scale ×4 is achieved
// purely by driving the global zoom to PRINT_RENDER_ZOOM (Editable* read
// useZoomLevel() to multiply fontSize/borderWidth) — no per-component scaling.
export const PRINT_CANVAS_DPI = 300;
export const EDITOR_CANVAS_DPI = 75;
export const PRINT_RENDER_ZOOM =
  PLAYABLE_ZOOM.DEFAULT * (PRINT_CANVAS_DPI / EDITOR_CANVAS_DPI); // 100 × 4 = 400

// === Animation Presets (used by demo mocks and animation editor) ===
export const ANIMATION_PRESETS = {
  // Entrance effects (2-6)
  appear: { type: EFFECT_TYPE.APPEAR, duration: 0 },
  fadeIn: { type: EFFECT_TYPE.FADE_IN, duration: 500 },
  flyInLeft: {
    type: EFFECT_TYPE.FLY_IN,
    duration: 600,
    direction: "left" as const,
  },
  flyInRight: {
    type: EFFECT_TYPE.FLY_IN,
    duration: 600,
    direction: "right" as const,
  },
  flyInTop: {
    type: EFFECT_TYPE.FLY_IN,
    duration: 600,
    direction: "up" as const,
  },
  flyInBottom: {
    type: EFFECT_TYPE.FLY_IN,
    duration: 600,
    direction: "down" as const,
  },
  floatInUp: {
    type: EFFECT_TYPE.FLOAT_IN,
    duration: 500,
    direction: "up" as const,
  },
  floatInDown: {
    type: EFFECT_TYPE.FLOAT_IN,
    duration: 500,
    direction: "down" as const,
  },
  floatInLeft: {
    type: EFFECT_TYPE.FLOAT_IN,
    duration: 500,
    direction: "left" as const,
  },
  zoomIn: { type: EFFECT_TYPE.ZOOM, duration: 500, amount: 1 },
  // Emphasis effects (7-10)
  spin: { type: EFFECT_TYPE.SPIN, duration: 800, amount: 1, loop: 0 },
  spinDouble: { type: EFFECT_TYPE.SPIN, duration: 1000, amount: 2, loop: 0 },
  teeter: { type: EFFECT_TYPE.TEETER, duration: 400, loop: 2 },
  grow: { type: EFFECT_TYPE.GROW_SHRINK, duration: 400, amount: 1.2 },
  shrink: { type: EFFECT_TYPE.GROW_SHRINK, duration: 400, amount: 0.8 },
  transparency: { type: EFFECT_TYPE.TRANSPARENCY, duration: 500, amount: 0.5 },
  // Exit effects (12-15)
  disappear: { type: EFFECT_TYPE.DISAPPEAR, duration: 0 },
  fadeOut: { type: EFFECT_TYPE.FADE_OUT, duration: 500 },
  flyOutRight: {
    type: EFFECT_TYPE.FLY_OUT,
    duration: 600,
    direction: "right" as const,
  },
  flyOutLeft: {
    type: EFFECT_TYPE.FLY_OUT,
    duration: 600,
    direction: "left" as const,
  },
  flyOutTop: {
    type: EFFECT_TYPE.FLY_OUT,
    duration: 600,
    direction: "up" as const,
  },
  floatOutUp: {
    type: EFFECT_TYPE.FLOAT_OUT,
    duration: 500,
    direction: "up" as const,
  },
  floatOutDown: {
    type: EFFECT_TYPE.FLOAT_OUT,
    duration: 500,
    direction: "down" as const,
  },
  // Motion effects (16-17) — geometry set per-animation
  lineMove: { type: EFFECT_TYPE.LINES, duration: 800 },
  arcMove: { type: EFFECT_TYPE.ARCS, duration: 1000 },
};
