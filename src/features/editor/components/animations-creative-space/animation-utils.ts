// animation-utils.ts - Pure utility functions for animation data transformation

import type {
  SpreadAnimation,
  ResolvedAnimation,
  AnimationFilterState,
  ObjectFilterOption,
  AvailableEffect,
  TargetItemIcon,
  ItemType,
} from '@/types/animation-types';
import {
  EFFECT_CATEGORY_MAP,
  TARGET_ICON_MAP,
  EFFECT_TYPE_NAMES,
  EFFECT_OPTIONS_MAP,
  ALLOWED_EFFECTS_BY_TARGET,
} from '@/constants/animation-constants';

// Items map: item id -> { title, type }
type ItemsMap = Map<string, { title: string; type: string }>;

export function resolveAnimations(
  animations: SpreadAnimation[],
  itemsMap: ItemsMap,
): ResolvedAnimation[] {
  const counterMap = new Map<string, number>();

  return animations.map((animation, index) => {
    const targetId = animation.target.id;
    const count = (counterMap.get(targetId) ?? 0) + 1;
    counterMap.set(targetId, count);

    const item = itemsMap.get(targetId);
    const title = item?.title ?? 'Unknown';
    const itemType = item?.type ?? 'image';

    return {
      animation,
      originalIndex: index,
      displayTitle: `${title} #${count}`,
      targetItemName: title,
      effectName: EFFECT_TYPE_NAMES[animation.effect.type] ?? `Effect ${animation.effect.type}`,
      effectCategory: EFFECT_CATEGORY_MAP[animation.effect.type] ?? 'entrance',
      targetItemIcon: (TARGET_ICON_MAP[itemType] ?? 'image') as TargetItemIcon,
    };
  });
}

export function buildDefaultEffect(effectType: number): SpreadAnimation['effect'] {
  const options = EFFECT_OPTIONS_MAP[effectType] ?? [];

  // Duration stored in milliseconds (matching ANIMATION_PRESETS convention)
  // Appear/Disappear have 0 duration; others default to 500ms
  const isInstant = effectType === 2 || effectType === 12;
  const defaultDuration = isInstant ? 0 : 500;

  const effect: SpreadAnimation['effect'] = {
    type: effectType,
    delay: 0,
  };

  if (options.includes('duration')) {
    effect.duration = defaultDuration;
  }
  if (options.includes('direction')) {
    effect.direction = 'left';
  }
  if (options.includes('amount')) {
    effect.amount = 1;
  }
  if (options.includes('loop')) {
    effect.loop = 0;
  }
  if (options.includes('geometry')) {
    effect.geometry = { x: 50, y: 50, w: 100, h: 100 };
  }

  return effect;
}

export function getAvailableEffects(targetType: ItemType | string): AvailableEffect[] {
  const allowedIds = ALLOWED_EFFECTS_BY_TARGET[targetType] ?? [];
  return allowedIds.map((id) => ({
    id,
    name: EFFECT_TYPE_NAMES[id] ?? `Effect ${id}`,
    category: EFFECT_CATEGORY_MAP[id] ?? 'entrance',
  }));
}

export function buildObjectFilterOptions(
  animations: ResolvedAnimation[],
  itemsMap: ItemsMap,
): ObjectFilterOption[] {
  const options: ObjectFilterOption[] = [{ id: 'all', label: 'All' }];
  const seen = new Set<string>();

  for (const resolved of animations) {
    const targetId = resolved.animation.target.id;
    if (seen.has(targetId)) continue;
    seen.add(targetId);

    const item = itemsMap.get(targetId);
    options.push({
      id: targetId,
      label: item?.title ?? 'Unknown',
      type: (item?.type as ItemType) ?? undefined,
    });
  }

  return options;
}

export function filterAnimations(
  animations: ResolvedAnimation[],
  filterState: AnimationFilterState,
): ResolvedAnimation[] {
  return animations.filter((resolved) => {
    // Object filter
    if (filterState.objectFilter !== 'all' && resolved.animation.target.id !== filterState.objectFilter) {
      return false;
    }
    // Effect category filter
    if (filterState.effectFilter !== 'all' && resolved.effectCategory !== filterState.effectFilter) {
      return false;
    }
    // Trigger filter (OR logic, empty = show all)
    if (filterState.triggerFilters.size > 0 && !filterState.triggerFilters.has(resolved.animation.trigger_type)) {
      return false;
    }
    return true;
  });
}

export function createDefaultFilterState(): AnimationFilterState {
  return {
    objectFilter: 'all',
    effectFilter: 'all',
    triggerFilters: new Set(),
  };
}
