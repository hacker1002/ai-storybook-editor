// human-filters.ts — Client-side filtering for humans list.

import type { Human, HumansFilterState } from '@/types/human';

export function matchSearch(h: Human, needle: string): boolean {
  if (!needle) return true;
  const lower = needle.toLowerCase();
  if (h.sourceName.toLowerCase().includes(lower)) return true;
  for (const v of Object.values(h.displayName ?? {})) {
    if (typeof v === 'string' && v.toLowerCase().includes(lower)) return true;
  }
  if (h.description && h.description.toLowerCase().includes(lower)) return true;
  return false;
}

export function applyFilters(humans: Human[], f: HumansFilterState): Human[] {
  const needle = f.search.trim();
  if (!needle) return humans;
  return humans.filter((h) => matchSearch(h, needle));
}
