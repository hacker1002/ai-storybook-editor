// visibility-utils.ts - Shared helpers for player_visible split-by-type rendering rule
// Used by: animation-editor-canvas, player-canvas, player-utils, animations-creative-space

import type { BaseSpread } from '@/types/spread-types';
import type { ItemType } from '@/types/spread-types';

/** player_visible=false → hidden. Undefined/true → visible (backward compat). */
export const isItemPlayerHidden = (
  item: { player_visible?: boolean } | null | undefined,
): boolean => item?.player_visible === false;

/** Inverse — use in .filter() chains */
export const isItemPlayerVisible = (
  item: { player_visible?: boolean } | null | undefined,
): boolean => !isItemPlayerHidden(item);

/**
 * Find a spread item by id + type across all 7 item arrays.
 * Returns null when spread is null or item not found.
 */
export function findSpreadItem(
  spread: BaseSpread | null | undefined,
  targetId: string,
  targetType: ItemType,
): { id: string; player_visible?: boolean } | null {
  if (!spread) return null;

  switch (targetType) {
    case 'image':
      return spread.images?.find((i) => i.id === targetId) ?? null;
    case 'shape':
      return spread.shapes?.find((s) => s.id === targetId) ?? null;
    case 'video':
      return spread.videos?.find((v) => v.id === targetId) ?? null;
    case 'animated_pic':
      return spread.animated_pics?.find((p) => p.id === targetId) ?? null;
    case 'textbox':
      return spread.textboxes?.find((t) => t.id === targetId) ?? null;
    case 'audio':
      return spread.audios?.find((a) => a.id === targetId) ?? null;
    case 'quiz':
      return spread.quizzes?.find((q) => q.id === targetId) ?? null;
    default:
      return null;
  }
}
