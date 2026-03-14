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
