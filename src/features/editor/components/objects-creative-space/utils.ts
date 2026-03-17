// utils.ts - Helpers for objects sidebar

import { getFirstTextboxKey } from '@/features/editor/utils/textbox-helpers';
import type { ObjectElementType } from './objects-creative-space';
import type { ObjectListEntry } from './objects-sidebar-list-item';
import type { BaseSpread, SpreadImage, SpreadTextbox, SpreadShape, SpreadVideo, SpreadAudio, SpreadQuiz } from '@/types/canvas-types';
import type { SpreadItemMediaType, SpreadTextboxContent } from '@/types/spread-types';

function getTextboxTitle(textbox: SpreadTextbox): string {
  const langKey = getFirstTextboxKey(textbox);
  if (!langKey) return textbox.title || 'Textbox';
  const content = textbox[langKey] as SpreadTextboxContent | undefined;
  return content?.text?.slice(0, 30) || textbox.title || 'Textbox';
}

export function buildObjectList(spread: BaseSpread, lockedItems: Set<string>): ObjectListEntry[] {
  const entries: ObjectListEntry[] = [];

  spread.images.forEach((img, i) => {
    entries.push({
      id: img.id,
      type: 'image',
      title: (img as SpreadImage).title || (img as SpreadImage).name || `Image ${i + 1}`,
      zIndex: (img as SpreadImage)['z-index'] ?? i,
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
      zIndex: i,
      editorVisible: (tb as SpreadTextbox).editor_visible !== false,
      locked: lockedItems.has(tb.id),
    });
  });

  spread.shapes?.forEach((shape, i) => {
    entries.push({
      id: shape.id,
      type: 'shape',
      title: `Shape ${i + 1}`,
      zIndex: i,
      editorVisible: (shape as SpreadShape).editor_visible !== false,
      locked: lockedItems.has(shape.id),
    });
  });

  spread.videos?.forEach((video, i) => {
    entries.push({
      id: video.id,
      type: 'video',
      title: (video as SpreadVideo).title || (video as SpreadVideo).name || `Video ${i + 1}`,
      zIndex: (video as SpreadVideo)['z-index'],
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
      zIndex: (audio as SpreadAudio)['z-index'],
      editorVisible: (audio as SpreadAudio).editor_visible !== false,
      locked: lockedItems.has(audio.id),
      assetType: (audio as SpreadAudio).type,
    });
  });

  spread.quizzes?.forEach((quiz, i) => {
    entries.push({
      id: quiz.id,
      type: 'quiz',
      title: `Quiz ${i + 1}`,
      zIndex: (quiz as SpreadQuiz)['z-index'],
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
