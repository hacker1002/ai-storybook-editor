// crop-preset-utils.ts — Pure CRUD helpers for books.crop_presets[] (design 05-crops-tab.md §7).
// The parent (ObjectsMainView / spreads-main-view) calls these to derive the next preset list,
// then persists via book-store.updateBook (optimistic + rollback). No store access here so the
// logic stays trivially unit-testable.

import type { CropPreset } from '@/types/editor';

/** Replace the preset with the same id, else append. Returns a NEW array. */
export function upsertCropPreset(list: CropPreset[], preset: CropPreset): CropPreset[] {
  const idx = list.findIndex((p) => p.id === preset.id);
  if (idx === -1) return [...list, preset];
  const next = list.slice();
  next[idx] = preset;
  return next;
}

/** Remove the preset with the given id. Returns a NEW array (unchanged content if absent). */
export function deleteCropPreset(list: CropPreset[], id: string): CropPreset[] {
  return list.filter((p) => p.id !== id);
}
