// utils.ts - Pure utility functions for animation data transformation

import type {
  SpreadAnimation,
  ResolvedAnimation,
  AnimationFilterState,
  ObjectFilterOption,
  AvailableEffect,
  TargetItemIcon,
  ItemType,
} from '@/types/animation-types';
import type { BaseSpread } from '@/types/spread-types';
import { findSpreadItem, isItemPlayerHidden } from '../playable-spread-view/visibility-utils';
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
  spread?: BaseSpread | null,
): ResolvedAnimation[] {
  const counterMap = new Map<string, number>();

  return animations.map((animation, index) => {
    const targetId = animation.target.id;
    const count = (counterMap.get(targetId) ?? 0) + 1;
    counterMap.set(targetId, count);

    const item = itemsMap.get(targetId);
    const title = item?.title ?? 'Unknown';
    const itemType = item?.type ?? 'image';

    const isTargetHidden = isItemPlayerHidden(
      findSpreadItem(spread ?? null, targetId, animation.target.type),
    );

    return {
      animation,
      originalIndex: index,
      displayTitle: `${title} #${count}`,
      targetItemName: title,
      effectName: EFFECT_TYPE_NAMES[animation.effect.type] ?? `Effect ${animation.effect.type}`,
      effectCategory: EFFECT_CATEGORY_MAP[animation.effect.type] ?? 'entrance',
      targetItemIcon: (TARGET_ICON_MAP[itemType] ?? 'image') as TargetItemIcon,
      isTargetHidden,
    };
  });
}

export function buildDefaultEffect(effectType: number): SpreadAnimation['effect'] {
  const options = EFFECT_OPTIONS_MAP[effectType] ?? [];

  const effect: SpreadAnimation['effect'] = {
    type: effectType,
    delay: 0,
  };

  if (options.includes('duration')) {
    effect.duration = 1000; // 1 second in ms
  }
  if (options.includes('direction')) {
    effect.direction = 'left';
  }
  if (options.includes('amount')) {
    effect.amount = 1;
  }
  if (options.includes('loop')) {
    effect.loop = 1; // play once (no repeat)
  }
  if (options.includes('geometry')) {
    effect.geometry = { x: 0, y: 0, w: 100, h: 100 };
  }

  return effect;
}

export function getAvailableEffects(
  targetType: ItemType | string,
  targetHasAudio?: boolean,
): AvailableEffect[] {
  const allowedIds = ALLOWED_EFFECTS_BY_TARGET[targetType] ?? [];
  return allowedIds
    .filter((id) => {
      // Hide read-along effect (11) when textbox has no audio
      if (id === 11 && targetType === 'textbox' && !targetHasAudio) return false;
      return true;
    })
    .map((id) => ({
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

/**
 * Compute step numbers for animation list display.
 * Only on_next/on_click triggers get an incrementing step number; others return null.
 */
export function computeStepNumbers(animations: ResolvedAnimation[]): (number | null)[] {
  let step = 0;
  return animations.map((resolved) => {
    const trigger = resolved.animation.trigger_type;
    if (trigger === 'on_next' || trigger === 'on_click') {
      step += 1;
      return step;
    }
    return null;
  });
}

/**
 * Build items lookup map from spread data for animation title resolution.
 * Textbox titles resolved via language key when provided.
 */
export function buildItemsMap(
  spread: BaseSpread | undefined,
  language?: string,
): ItemsMap {
  const map: ItemsMap = new Map();
  if (!spread) return map;

  for (const img of spread.images ?? []) {
    map.set(img.id, { title: img.title ?? img.id, type: 'image' });
  }
  for (const tb of spread.textboxes ?? []) {
    // Resolve textbox title: prefer language-specific content, fallback to title/id
    let title = tb.title ?? tb.id;
    if (language) {
      const langContent = tb[language];
      if (langContent && typeof langContent === 'object' && 'text' in langContent) {
        const text = (langContent as { text: string }).text;
        if (text) title = text.length > 20 ? text.slice(0, 20) + '…' : text;
      }
    }
    map.set(tb.id, { title, type: 'textbox' });
  }
  for (const [i, sh] of (spread.shapes ?? []).entries()) {
    map.set(sh.id, { title: (sh as { title?: string }).title || `Shape ${i + 1}`, type: 'shape' });
  }
  for (const vid of spread.videos ?? []) {
    map.set(vid.id, { title: (vid as { title?: string }).title ?? vid.id, type: 'video' });
  }
  for (const aud of spread.audios ?? []) {
    map.set(aud.id, { title: (aud as { title?: string }).title ?? aud.id, type: 'audio' });
  }
  for (const ap of spread.auto_pics ?? []) {
    map.set(ap.id, { title: (ap as { title?: string }).title ?? ap.id, type: 'auto_pic' });
  }
  for (const quiz of spread.quizzes ?? []) {
    let quizTitle = quiz.title ?? quiz.id;
    if (!quiz.title) {
      const reserved = new Set(['id', 'title', 'geometry', 'z-index', 'player_visible', 'editor_visible', 'options']);
      for (const key of Object.keys(quiz)) {
        if (reserved.has(key)) continue;
        const content = quiz[key] as { question?: string } | undefined;
        if (content?.question) {
          quizTitle = content.question.length > 20 ? content.question.slice(0, 20) + '…' : content.question;
          break;
        }
      }
    }
    map.set(quiz.id, { title: quizTitle, type: 'quiz' });
  }

  return map;
}
