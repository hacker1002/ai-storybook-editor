// constants.ts — Tunable limits + defaults for the art-style library (/styles).

import type { StylesFilterState } from '@/types/art-style';

/** Max reference images per style (card shows all, no "+N" badge). */
export const REF_CAP = 3;

/** Max size for a single reference image upload (10MB). */
export const MAX_STYLE_IMG_BYTES = 10 * 1024 * 1024;

/** Max distinct tag chips rendered on a card before truncation. */
export const MAX_TAG_CHIPS = 4;

/** Debounce for the toolbar search input (ms). */
export const SEARCH_DEBOUNCE_MS = 200;

/** Initial / reset filter state. */
export const DEFAULT_STYLES_FILTERS: StylesFilterState = {
  search: '',
  references: 'all',
  tags: [],
  type: 'all',
};

/** Public Supabase Storage bucket shared across the asset library. */
export const STORAGE_BUCKET = 'storybook-assets';

/** Storage path prefix for art-style reference images. */
export const STYLE_STORAGE_PREFIX = 'art-styles';
