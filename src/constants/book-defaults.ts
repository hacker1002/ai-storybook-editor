// book-defaults.ts — Fallback defaults when book.shape / book.typography are null.
// Used by SpreadsSidebar and ObjectsSidebar for new element creation.

import type { BookShape, TypographySettings } from '@/types/editor';
import type { Typography } from '@/types/spread-types';

/** Fallback shape defaults when book.shape is not configured. */
export const FALLBACK_SHAPE: BookShape = {
  fill: { is_filled: true, color: '#E0E0E0', opacity: 1 },
  outline: { color: '#999999', width: 1, radius: 0, type: 0 },
};

/**
 * Map TypographySettings (snake_case, DB/editor store) to Typography (camelCase, canvas).
 * Called when building textbox defaults from book.typography[langCode].
 */
export function mapTypographyToTextbox(typo: TypographySettings): Typography {
  return {
    family: typo.family,
    size: typo.size,
    weight: typo.weight,
    style: typo.style as Typography['style'],
    color: typo.color,
    lineHeight: typo.line_height,
    letterSpacing: typo.letter_spacing,
    decoration: typo.decoration as Typography['decoration'],
    textAlign: typo.text_align as Typography['textAlign'],
    textTransform: typo.text_transform as Typography['textTransform'],
  };
}
