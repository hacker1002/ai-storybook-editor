// constants.ts - Layout and UI constants for PlayableSpreadView

import type { PlayMode } from './types';

// === Layout Constants ===
export const LAYOUT = {
  HEADER_HEIGHT: 48,      // px
  FOOTER_HEIGHT: 120,     // px
  THUMBNAIL_WIDTH: 100,   // px
  THUMBNAIL_HEIGHT: 80,   // px
  THUMBNAIL_GAP: 8,       // px
} as const;

// === Visual Constants ===
export const THUMBNAIL_STYLES = {
  SELECTED_BORDER: '2px solid #2196F3',
  UNSELECTED_BORDER: '1px solid #E0E0E0',
  HOVER_BG: '#E3F2FD',
  BORDER_RADIUS: 4,       // px
} as const;

// === Play Mode Cycle ===
export const PLAY_MODE_CYCLE: PlayMode[] = ['off', 'semi-auto', 'auto'];

// === Volume Constants ===
export const VOLUME = {
  DEFAULT: 100,
  STEP: 10,
  MIN: 0,
  MAX: 100,
} as const;

// === Keyboard Shortcuts ===
export const KEYBOARD_SHORTCUTS = {
  TOGGLE_PLAY: ' ',       // Space
  STOP: 'Escape',
  PREV_SPREAD: 'ArrowLeft',
  NEXT_SPREAD: 'ArrowRight',
  TOGGLE_MUTE: 'm',
  VOLUME_UP: 'ArrowUp',
  VOLUME_DOWN: 'ArrowDown',
  FIRST_SPREAD: 'Home',
  LAST_SPREAD: 'End',
} as const;

// === Remix Editor Constants ===
export const REMIX_EDITOR = {
  PROMPT_MAX_LENGTH: 500,
  REFERENCE_MAX_SIZE_MB: 10,
  TOOLBAR_MIN_WIDTH: 320,
  TOOLBAR_GAP: 8,
} as const;

// === Remix Visual Styles ===
export const REMIX_STYLES = {
  SWAPPABLE_BORDER_IDLE: '1px dashed #9E9E9E',
  SWAPPABLE_BORDER_HOVER: '1px solid #757575',
  SELECTION_BORDER: '2px solid #2196F3',
  FOCUS_RING: '2px solid #2196F3',
} as const;

// === Z-Index Constants ===
export const TEXTBOX_Z_INDEX_BASE = 300;

// === Effect Type Constants ===
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
} as const;

export const EFFECT_TYPE_NAMES: Record<number, string> = {
  1: 'Play',
  2: 'Appear',
  3: 'Fade In',
  4: 'Fly In',
  5: 'Float In',
  6: 'Zoom',
  7: 'Spin',
  8: 'Grow/Shrink',
  9: 'Teeter',
  10: 'Transparency',
  11: 'Read-along',
  12: 'Disappear',
  13: 'Fade Out',
  14: 'Fly Out',
  15: 'Float Out',
  16: 'Lines',
  17: 'Arcs',
};

// === Animation Presets ===
export const ANIMATION_PRESETS = {
  fadeIn: { type: EFFECT_TYPE.FADE_IN, duration: 500 },
  flyInLeft: { type: EFFECT_TYPE.FLY_IN, duration: 600, direction: 'left' as const },
  flyInRight: { type: EFFECT_TYPE.FLY_IN, duration: 600, direction: 'right' as const },
  flyInTop: { type: EFFECT_TYPE.FLY_IN, duration: 600, direction: 'up' as const },
  zoomIn: { type: EFFECT_TYPE.ZOOM, duration: 500 },
  spin: { type: EFFECT_TYPE.SPIN, duration: 800, amount: 1, loop: 0 },
  teeter: { type: EFFECT_TYPE.TEETER, duration: 400, loop: 2 },
  grow: { type: EFFECT_TYPE.GROW_SHRINK, duration: 400, amount: 1.2 },
  fadeOut: { type: EFFECT_TYPE.FADE_OUT, duration: 500 },
  flyOutRight: { type: EFFECT_TYPE.FLY_OUT, duration: 600, direction: 'right' as const },
};
