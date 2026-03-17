// utils.ts - Helpers for objects sidebar

import { getFirstTextboxKey } from '@/features/editor/utils/textbox-helpers';
import { LAYER_CONFIG, LAYER_ORDER } from '@/constants/spread-constants';
import type { ObjectElementType } from './objects-creative-space';
import type { ObjectListEntry } from './objects-sidebar-list-item';
import type { BaseSpread, SpreadImage, SpreadTextbox, SpreadShape, SpreadVideo, SpreadAudio, SpreadQuiz } from '@/types/canvas-types';
import type { SpreadItemMediaType, SpreadTextboxContent } from '@/types/spread-types';

// === Layer helpers ===

type LayerRange = typeof LAYER_CONFIG[keyof typeof LAYER_CONFIG];

/** Find the layer config for a given element type */
export function getLayerForType(type: ObjectElementType): LayerRange | null {
  for (const layer of Object.values(LAYER_CONFIG)) {
    if ((layer.types as readonly string[]).includes(type)) return layer;
  }
  return null;
}

/** Check whether a z-index value falls within its expected layer range */
function isInLayerRange(zIndex: number, layer: LayerRange): boolean {
  return zIndex >= layer.min && zIndex <= layer.max;
}

/**
 * Auto-assign z-index within the correct layer range.
 * If the raw z-index is missing/undefined/NaN or falls outside the layer range,
 * place the item at (layer.min + positionInType) clamped to layer.max.
 */
function resolveZIndex(raw: number | undefined, positionInType: number, layer: LayerRange): number {
  if (raw != null && !Number.isNaN(raw) && isInLayerRange(raw, layer)) {
    return raw;
  }
  return Math.min(layer.min + positionInType, layer.max);
}

/**
 * Group entries by layer (top to bottom: TEXT → OBJECTS → MEDIA).
 * Each group is internally sorted descending by z-index.
 */
export interface LayerGroup {
  layer: LayerRange;
  entries: ObjectListEntry[];
}

export function groupEntriesByLayer(entries: ObjectListEntry[]): LayerGroup[] {
  const groups: LayerGroup[] = LAYER_ORDER.map((layer) => ({
    layer,
    entries: [],
  }));

  for (const entry of entries) {
    const layer = getLayerForType(entry.type);
    if (!layer) continue;
    const group = groups.find((g) => g.layer === layer);
    group?.entries.push(entry);
  }

  // Sort each group descending by z-index
  for (const group of groups) {
    group.entries.sort((a, b) => b.zIndex - a.zIndex);
  }

  // Remove empty groups
  return groups.filter((g) => g.entries.length > 0);
}

// === Title helpers ===

function getTextboxTitle(textbox: SpreadTextbox): string {
  if (textbox.title) return textbox.title;
  const langKey = getFirstTextboxKey(textbox);
  if (!langKey) return 'Textbox';
  const content = textbox[langKey] as SpreadTextboxContent | undefined;
  return content?.text?.slice(0, 30) || 'Textbox';
}

// === Build & filter ===

export function buildObjectList(spread: BaseSpread, lockedItems: Set<string>): ObjectListEntry[] {
  const entries: ObjectListEntry[] = [];

  const mediaLayer = LAYER_CONFIG.MEDIA;
  const objectsLayer = LAYER_CONFIG.OBJECTS;
  const textLayer = LAYER_CONFIG.TEXT;

  spread.images.forEach((img, i) => {
    entries.push({
      id: img.id,
      type: 'image',
      title: (img as SpreadImage).title || (img as SpreadImage).name || `Image ${i + 1}`,
      zIndex: resolveZIndex((img as SpreadImage)['z-index'], i, mediaLayer),
      editorVisible: (img as SpreadImage).editor_visible !== false,
      locked: lockedItems.has(img.id),
      assetType: (img as SpreadImage).type,
    });
  });

  spread.textboxes.forEach((tb, i) => {
    entries.push({
      id: tb.id,
      type: 'text',
      title: getTextboxTitle(tb as SpreadTextbox),
      zIndex: resolveZIndex((tb as SpreadTextbox)['z-index'], i, textLayer),
      editorVisible: (tb as SpreadTextbox).editor_visible !== false,
      locked: lockedItems.has(tb.id),
    });
  });

  spread.shapes?.forEach((shape, i) => {
    entries.push({
      id: shape.id,
      type: 'shape',
      title: (shape as SpreadShape).title || `Shape ${i + 1}`,
      zIndex: resolveZIndex((shape as SpreadShape)['z-index'], i, objectsLayer),
      editorVisible: (shape as SpreadShape).editor_visible !== false,
      locked: lockedItems.has(shape.id),
    });
  });

  spread.videos?.forEach((video, i) => {
    entries.push({
      id: video.id,
      type: 'video',
      title: (video as SpreadVideo).title || (video as SpreadVideo).name || `Video ${i + 1}`,
      zIndex: resolveZIndex((video as SpreadVideo)['z-index'], i, mediaLayer),
      editorVisible: (video as SpreadVideo).editor_visible !== false,
      locked: lockedItems.has(video.id),
      assetType: (video as SpreadVideo).type,
    });
  });

  spread.audios?.forEach((audio, i) => {
    entries.push({
      id: audio.id,
      type: 'audio',
      title: (audio as SpreadAudio).title || (audio as SpreadAudio).name || `Audio ${i + 1}`,
      zIndex: resolveZIndex((audio as SpreadAudio)['z-index'], i, objectsLayer),
      editorVisible: (audio as SpreadAudio).editor_visible !== false,
      locked: lockedItems.has(audio.id),
      assetType: (audio as SpreadAudio).type,
    });
  });

  spread.quizzes?.forEach((quiz, i) => {
    entries.push({
      id: quiz.id,
      type: 'quiz',
      title: (quiz as SpreadQuiz).title || `Quiz ${i + 1}`,
      zIndex: resolveZIndex((quiz as SpreadQuiz)['z-index'], i, objectsLayer),
      editorVisible: (quiz as SpreadQuiz).editor_visible !== false,
      locked: lockedItems.has(quiz.id),
    });
  });

  // Sort descending by z-index (highest = top of list)
  return entries.sort((a, b) => b.zIndex - a.zIndex);
}

export function filterObjectList(
  entries: ObjectListEntry[],
  elementFilter: Set<ObjectElementType>,
  assetFilter: Set<SpreadItemMediaType>,
  allElements: boolean,
  allAssets: boolean
): ObjectListEntry[] {
  return entries.filter((entry) => {
    if (!allElements && !elementFilter.has(entry.type)) return false;
    // Asset type filter only applies to items that have assetType
    if (!allAssets && entry.assetType && !assetFilter.has(entry.assetType)) return false;
    return true;
  });
}
