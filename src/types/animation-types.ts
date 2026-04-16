// animation-types.ts - Type definitions for AnimationsCreativeSpace feature

import type { SpreadAnimation, Geometry } from '@/types/spread-types';
import type { ItemType } from '@/types/spread-types';

// Re-export for consumer convenience
export type { SpreadAnimation, Geometry };
export type { ItemType };

export type EffectCategory = 'play' | 'read-along' | 'entrance' | 'emphasis' | 'exit' | 'motion-paths';

export type TargetItemIcon = 'image' | 'audio' | 'video' | 'textbox' | 'shape' | 'quiz' | 'animated_pic';

export interface ResolvedAnimation {
  animation: SpreadAnimation;
  originalIndex: number;
  displayTitle: string;
  targetItemName: string;         // raw object name without counter suffix
  effectName: string;             // human-readable effect name (e.g., "Fade In")
  effectCategory: EffectCategory;
  targetItemIcon: TargetItemIcon;
}

export interface AnimationFilterState {
  objectFilter: string; // 'all' | item id
  effectFilter: string; // 'all' | EffectCategory
  triggerFilters: Set<string>; // empty = show all
}

export interface ObjectFilterOption {
  id: string; // target item id, or 'all'
  label: string; // "All", "Elara", "Magic Sword"
  type?: ItemType; // undefined for 'all' option
}

export interface AvailableEffect {
  id: number; // effect type number (1-17)
  name: string; // display name from EFFECT_TYPE_NAMES
  category: EffectCategory;
}

export interface SelectedItem {
  id: string;
  type: ItemType;
}
