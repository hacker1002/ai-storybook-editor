// branch-utils.ts - Pure utility functions for BranchCreativeSpace feature

import { createLogger } from '@/utils/logger';
import type { BaseSpread, Section, SidebarListItem, GridLayoutItem } from './branch-types';

const log = createLogger('Editor', 'BranchUtils');

// Internal: map section start/end IDs to index ranges within the spreads array
function buildSectionSpreadMap(
  spreads: BaseSpread[],
  sections: Section[],
): { sectionByStartId: Map<string, Section>; sectionSpreadSet: Set<string>; spreadIndexMap: Map<string, number> } {
  const spreadIndexMap = new Map<string, number>();
  spreads.forEach((sp, i) => spreadIndexMap.set(sp.id, i));

  const sectionByStartId = new Map<string, Section>();
  const sectionSpreadSet = new Set<string>();

  for (const section of sections) {
    const startIdx = spreadIndexMap.get(section.start_spread_id);
    const endIdx = spreadIndexMap.get(section.end_spread_id);

    if (startIdx === undefined || endIdx === undefined) {
      log.warn('buildSectionSpreadMap', 'skipping section with invalid spread refs', {
        sectionId: section.id,
      });
      continue;
    }

    sectionByStartId.set(section.start_spread_id, section);

    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    for (let i = lo; i <= hi; i++) {
      sectionSpreadSet.add(spreads[i].id);
    }
  }

  return { sectionByStartId, sectionSpreadSet, spreadIndexMap };
}

// Build interleaved sidebar list: free spreads + section headers with optional children
export function buildSidebarList(
  spreads: BaseSpread[],
  sections: Section[],
  expandedSectionIds: Set<string>,
): SidebarListItem[] {
  const { sectionByStartId, sectionSpreadSet, spreadIndexMap } = buildSectionSpreadMap(spreads, sections);

  const items: SidebarListItem[] = [];

  for (let i = 0; i < spreads.length; i++) {
    const spread = spreads[i];

    if (!sectionSpreadSet.has(spread.id)) {
      // Free spread — not part of any section
      items.push({ type: 'spread', spread, isChild: false });
      continue;
    }

    const section = sectionByStartId.get(spread.id);
    if (section) {
      // Section header at start_spread_id
      const startIdx = spreadIndexMap.get(section.start_spread_id)!;
      const endIdx = spreadIndexMap.get(section.end_spread_id)!;
      const lo = Math.min(startIdx, endIdx);
      const hi = Math.max(startIdx, endIdx);
      const spreadCount = hi - lo + 1;

      items.push({ type: 'section', section, spreadCount });

      if (expandedSectionIds.has(section.id)) {
        for (let j = lo; j <= hi; j++) {
          items.push({ type: 'spread', spread: spreads[j], isChild: true, sectionId: section.id });
        }
      }

      // Skip remaining spreads in this section (already processed or will be as children)
      i = hi;
    }
    // Else: spread is inside a section but not the start — already handled by section expansion above
  }

  return items;
}

// Build grid layout: free spreads + section groups (full-width)
export function buildGridLayout(
  spreads: BaseSpread[],
  sections: Section[],
  expandedSectionIds: Set<string>,
): GridLayoutItem[] {
  const { sectionByStartId, sectionSpreadSet, spreadIndexMap } = buildSectionSpreadMap(spreads, sections);

  const items: GridLayoutItem[] = [];

  for (let i = 0; i < spreads.length; i++) {
    const spread = spreads[i];

    if (!sectionSpreadSet.has(spread.id)) {
      items.push({ type: 'free-spread', spread });
      continue;
    }

    const section = sectionByStartId.get(spread.id);
    if (section) {
      const startIdx = spreadIndexMap.get(section.start_spread_id)!;
      const endIdx = spreadIndexMap.get(section.end_spread_id)!;
      const lo = Math.min(startIdx, endIdx);
      const hi = Math.max(startIdx, endIdx);
      const childSpreads = spreads.slice(lo, hi + 1);
      const isExpanded = expandedSectionIds.has(section.id);

      items.push({ type: 'section-group', section, spreads: childSpreads, isExpanded });
      i = hi;
    }
  }

  return items;
}

// Compute which free spread IDs are adjacent to the current selection (for add section mode)
export function computeAdjacentFreeSpreadIds(
  selectedIds: string[],
  allSpreads: BaseSpread[],
  sections: Section[],
  excludeSectionId?: string,
): Set<string> {
  // When editing a section, exclude its spreads from the "occupied" set so they're selectable
  const effectiveSections = excludeSectionId
    ? sections.filter((s) => s.id !== excludeSectionId)
    : sections;
  const { sectionSpreadSet, spreadIndexMap } = buildSectionSpreadMap(allSpreads, effectiveSections);

  if (selectedIds.length === 0) {
    // All free spreads are selectable when nothing selected
    const freeIds = new Set<string>();
    for (const sp of allSpreads) {
      if (!sectionSpreadSet.has(sp.id)) freeIds.add(sp.id);
    }
    return freeIds;
  }

  // Find min/max index of current selection
  let minIdx = Infinity;
  let maxIdx = -Infinity;
  for (const id of selectedIds) {
    const idx = spreadIndexMap.get(id);
    if (idx !== undefined) {
      minIdx = Math.min(minIdx, idx);
      maxIdx = Math.max(maxIdx, idx);
    }
  }

  const result = new Set<string>(selectedIds);

  // Expand left
  for (let i = minIdx - 1; i >= 0; i--) {
    if (sectionSpreadSet.has(allSpreads[i].id)) break;
    result.add(allSpreads[i].id);
  }

  // Expand right
  for (let i = maxIdx + 1; i < allSpreads.length; i++) {
    if (sectionSpreadSet.has(allSpreads[i].id)) break;
    result.add(allSpreads[i].id);
  }

  return result;
}
