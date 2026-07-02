// sketch-spread-excel.constants.ts — mapping constants for the SHARED new-template
// sketch-spread parser (design 04-import-sketch-spreads.md §4 + 07-01 §7). New template:
// Storyboard = 14 labeled rows mapped DIRECTLY 1 label → 1 art_direction field (no
// `Chỉ đạo hình ảnh` sub-field heuristic); narration moved to per-language tabs.

import type { ArtDirection } from '@/types/sketch';
import type { Typography } from '@/types/spread-types';

// Textbox bottom-band geometry defaults reuse the book importer's per-side constants
// (single source of truth) — used only as fallback when the `Textbox` row is missing /
// unparseable. Real geometry is per-language, read from each lang tab.
export {
  DEFAULT_LEFT_TEXTBOX_GEO,
  DEFAULT_RIGHT_TEXTBOX_GEO,
  DEFAULT_DPS_TEXTBOX_GEO,
} from './import-script-constants';

/** Storyboard sheet name (art_direction + structure). */
export const STORYBOARD_SHEET = 'Storyboard';

/** Language tab detector — `vi_VN`, `en_US`, … (textbox source, one tab per language). */
export const LANG_SHEET_RE = /^[a-z]{2}_[A-Z]{2}$/;

/** SPREAD header detector (col A) — group 1 = spread number = multi-sheet join key. */
export const SPREAD_HEADER_RE = /^SPREAD\s+(\d+)/i;

/** Header marker for a double-page spread (read the LEFT column only). */
export const DPS_MARKER = 'TRANG ĐÔI';

/** Main-lane page columns (0-based): B=TRÁI(left), C=PHẢI(right). Branch D/E ignored. */
export const MAIN_LANE = { left: 1, right: 2 } as const;

/** Storyboard `Diễn biến` row — merged into `action` alongside `Character`. */
export const DIEN_BIEN = 'Diễn biến';
/** Narration label in a language tab — matched by PREFIX (suffix varies per tab). */
export const LOI_VAN_PREFIX = 'Lời văn';
/** Geometry/typography row label in a language tab. */
export const TEXTBOX_ROW = 'Textbox';
/** Branch-nav label (choice spreads) — ignored (sketch has no branches). */
export const CHOICE_ROW = 'Choice';

/** Parse tokens out of `x=4% y=12% w=16% h=76% font_size=22`. */
export const GEO_TOKEN_RE = /(x|y|w|h|font_size)\s*=\s*(\d+(?:\.\d+)?)%?/g;

// Storyboard row label (col A) → ArtDirection field. Map DIRECTLY 1-1 (design 04 §4).
// `Character` → `action` (merged with the `Diễn biến` row via DIEN_BIEN).
export const AD_ROW: Record<string, keyof ArtDirection> = {
  Stage: 'stage',
  Camera: 'camera',
  Composition: 'composition',
  Setting: 'setting',
  Character: 'action',
  'Space & time': 'space_time',
  'Light & color': 'light_color',
  'Art concept': 'art_concept',
  Animation: 'animation',
  Sound: 'sound',
  Layer: 'layers',
  'Interactive intent': 'interactive_intent',
  'Negative space': 'negative_space',
};

/** The 13 ArtDirection keys — seed an empty art_direction (all ''). Derived from AD_ROW
 *  (whose 13 values cover every field) so the two lists can never drift. */
export const AD_KEYS: (keyof ArtDirection)[] = [...new Set(Object.values(AD_ROW))];

/** Known Storyboard row labels — anything else is warned + ignored (design 04 §6). */
export const KNOWN_STORYBOARD_LABELS: ReadonlySet<string> = new Set<string>([
  ...Object.keys(AD_ROW),
  DIEN_BIEN,
  CHOICE_ROW,
]);

// Excel carries no textbox color / font-family → default fallback (design 04 §4.3),
// applied when book.typography has no entry for the language.
export const DEFAULT_TEXTBOX_TYPOGRAPHY: Typography = { size: 16, color: '#000000' };
