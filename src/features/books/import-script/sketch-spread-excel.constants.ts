// sketch-spread-excel.constants.ts — mapping constants for the SHARED new-template
// sketch-spread parser (design 04-import-sketch-spreads.md §4 + 07-01 §7). New template:
// Storyboard = 9 labeled rows (7 mapped DIRECTLY 1 label → 1 art_direction field, plus
// `Diễn biến` merged into `action` and `Choice` ignored); no `Chỉ đạo hình ảnh` sub-field
// heuristic; narration moved to per-language tabs.

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
// Labels match the REAL workbook template exactly: 7 mapped rows + `Diễn biến` + `Choice`.
export const AD_ROW = {
  Stage: 'stage',
  Camera: 'camera',
  Composition: 'composition',
  Setting: 'setting',
  Character: 'action',
  'Light & tone': 'light_tone',
  'Art language': 'art_language',
} as const satisfies Record<string, keyof ArtDirection>;

/** The 7 ArtDirection keys — seed an empty art_direction (all ''). Derived from AD_ROW so
 *  a mapped row can never miss its key; the guard below adds the other direction (every
 *  ArtDirection field must have a Storyboard row). */
export const AD_KEYS: (keyof ArtDirection)[] = [...new Set(Object.values(AD_ROW))];

// Compile-time exhaustiveness guard — errors naming the offending key as soon as an
// ArtDirection field has no AD_ROW entry. Needed because AD_KEYS is only guaranteed
// ⊆ ArtDirection, and `emptyArtDirection()` casts `{} as ArtDirection`: an unmapped field
// would yield an object missing that key while typed complete — invisible to validation,
// the modal (`?? ''`) and Python (`_nonempty_str`), surfacing only as a mysteriously empty
// prompt section.
//
// The `as const` on AD_ROW is what makes this load-bearing: re-adding an explicit
// `Record<string, keyof ArtDirection>` annotation widens the value type back to the full
// key union, `Exclude` collapses to `never`, and the guard silently passes for ANY map.
type AssertNoUnmappedField<T extends never> = T;
export type AdRowCoversAllFields = AssertNoUnmappedField<
  Exclude<keyof ArtDirection, (typeof AD_ROW)[keyof typeof AD_ROW]>
>;

/** Known Storyboard row labels — anything else is warned + ignored (design 04 §6). */
export const KNOWN_STORYBOARD_LABELS: ReadonlySet<string> = new Set<string>([
  ...Object.keys(AD_ROW),
  DIEN_BIEN,
  CHOICE_ROW,
]);

// Excel carries no textbox color / font-family → default fallback (design 04 §4.3),
// applied when book.typography has no entry for the language.
export const DEFAULT_TEXTBOX_TYPOGRAPHY: Typography = { size: 16, color: '#000000' };
