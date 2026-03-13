// animation-constants.ts - Mapping constants for AnimationsCreativeSpace feature

import type { EffectCategory, TargetItemIcon } from './animation-types';
import { EFFECT_TYPE, EFFECT_TYPE_NAMES } from '@/components/playable-spread-view/constants';

// Re-export for convenience
export { EFFECT_TYPE, EFFECT_TYPE_NAMES };

export const EFFECT_CATEGORY_MAP: Record<number, EffectCategory> = {
  1: 'play',
  2: 'entrance', 3: 'entrance', 4: 'entrance', 5: 'entrance', 6: 'entrance',
  7: 'emphasis', 8: 'emphasis', 9: 'emphasis', 10: 'emphasis', 11: 'emphasis',
  12: 'exit', 13: 'exit', 14: 'exit', 15: 'exit',
  16: 'motion-paths', 17: 'motion-paths',
};

export const STAR_COLOR_MAP: Record<EffectCategory, string> = {
  'play': '#3B82F6',
  'entrance': '#22C55E',
  'emphasis': '#EAB308',
  'exit': '#EF4444',
  'motion-paths': '#3B82F6',
};

export const EFFECT_OPTIONS_MAP: Record<number, string[]> = {
  1:  ['delay', 'loop'],
  2:  ['delay'],
  3:  ['delay', 'duration'],
  4:  ['delay', 'duration', 'direction'],
  5:  ['delay', 'duration', 'direction'],
  6:  ['delay', 'duration', 'amount'],
  7:  ['delay', 'duration', 'loop', 'amount', 'direction'],
  8:  ['delay', 'duration', 'amount', 'direction'],
  9:  ['delay', 'duration', 'loop'],
  10: ['delay', 'duration'],
  11: ['delay'],
  12: ['delay', 'duration'],
  13: ['delay', 'duration'],
  14: ['delay', 'duration', 'direction'],
  15: ['delay', 'duration'],
  16: ['delay', 'duration', 'geometry'],
  17: ['delay', 'duration'],
};

export const TARGET_ICON_MAP: Record<string, TargetItemIcon> = {
  image: 'image',
  textbox: 'text',
  shape: 'shape',
  video: 'video',
  audio: 'audio',
  quiz: 'quiz',
};

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  on_next: 'On Next',
  on_click: 'On Click',
  with_previous: 'With Previous',
  after_previous: 'After Previous',
};

export const EFFECT_CATEGORY_LABELS: Record<EffectCategory, string> = {
  play: 'Play',
  entrance: 'Entrance',
  emphasis: 'Emphasis',
  exit: 'Exit',
  'motion-paths': 'Motion Paths',
};

// Effect grid filtering per target type
export const ALLOWED_EFFECTS_BY_TARGET: Record<string, number[]> = {
  audio: [1, 2, 12],
  video: [1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17],
  textbox: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  image: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17],
  shape: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15],
  quiz: [1],
};

export const SIDEBAR_WIDTH = 280;
