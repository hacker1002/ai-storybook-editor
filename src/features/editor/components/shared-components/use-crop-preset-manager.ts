// use-crop-preset-manager.ts — shared book.crop_presets CRUD adapter for the ExtractImageModal
// Crops tab. The presets live on the book (books.crop_presets JSONB[]) and are mutated via
// book-store updateBook; this hook packages the same {source, upsert, delete} triple the sketch
// spread canvas inlines, so the base/variant extract connectors don't each re-implement it.
//
// Returns `cropPresets: undefined` when no book is loaded → the modal falls back to Custom-only.

import { useCallback } from 'react';
import { useCurrentBook, useBookActions } from '@/stores/book-store';
import {
  upsertCropPreset,
  deleteCropPreset,
} from '@/features/editor/components/shared-components/extract-image-modal/crop-preset-utils';
import type { CropPreset } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useCropPresetManager');

export interface CropPresetManager {
  cropPresets: CropPreset[] | undefined;
  onUpsertCropPreset: (preset: CropPreset) => void;
  onDeleteCropPreset: (presetId: string) => void;
}

export function useCropPresetManager(): CropPresetManager {
  const book = useCurrentBook();
  const { updateBook } = useBookActions();

  const onUpsertCropPreset = useCallback(
    (preset: CropPreset) => {
      if (!book) return;
      log.debug('onUpsertCropPreset', 'upsert crop preset', { presetId: preset.id });
      void updateBook(book.id, { crop_presets: upsertCropPreset(book.crop_presets ?? [], preset) });
    },
    [book, updateBook],
  );

  const onDeleteCropPreset = useCallback(
    (presetId: string) => {
      if (!book) return;
      log.debug('onDeleteCropPreset', 'delete crop preset', { presetId });
      void updateBook(book.id, { crop_presets: deleteCropPreset(book.crop_presets ?? [], presetId) });
    },
    [book, updateBook],
  );

  return { cropPresets: book?.crop_presets ?? undefined, onUpsertCropPreset, onDeleteCropPreset };
}
