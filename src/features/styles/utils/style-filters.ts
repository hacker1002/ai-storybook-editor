// style-filters.ts — Tag parsing + filter logic for the art-style library.
// `art_styles.tags` is comma-separated TEXT (not array); parse here, reuse everywhere.
// Ports design spec README §1.4 (tag parsing) + §2.3 (applyFilters / matchSearch).

import type { ArtStyle, StylesFilterState } from '@/types/art-style';

/** Split raw comma-separated tags → distinct lowercase tokens (order preserved). */
export function parseTags(tags: string): string[] {
  return (tags ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** Union of all tags across styles, sorted ascending (for toolbar tag filter). */
export function distinctTags(styles: ArtStyle[]): string[] {
  const set = new Set<string>();
  for (const s of styles) for (const t of parseTags(s.tags)) set.add(t);
  return Array.from(set).sort();
}

/** True if `needle` matches name / description / any tag (substring, case-insensitive). */
export function matchSearch(style: ArtStyle, needle: string): boolean {
  if (!needle) return true;
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return (
    style.name.toLowerCase().includes(n) ||
    (style.description ?? '').toLowerCase().includes(n) ||
    parseTags(style.tags).some((t) => t.includes(n))
  );
}

/** Apply search + references + tags (OR) filters → filtered styles. */
export function applyFilters(styles: ArtStyle[], f: StylesFilterState): ArtStyle[] {
  const needle = f.search.trim().toLowerCase();
  return styles.filter((s) => {
    if (needle && !matchSearch(s, needle)) return false;
    if (f.references === 'with' && s.imageReferences.length === 0) return false;
    if (f.references === 'none' && s.imageReferences.length > 0) return false;
    if (f.tags.length > 0) {
      const styleTags = parseTags(s.tags);
      if (!f.tags.some((t) => styleTags.includes(t))) return false; // OR semantics
    }
    return true;
  });
}
