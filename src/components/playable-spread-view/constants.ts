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
