// illustration-branching-helpers.ts - Section, branch, locale, and navigation actions
// Split from illustration-slice.ts to keep each file under 500 LOC

import type { SnapshotStore } from '../types';
import type { BranchSetting, Branch, BranchLocalizedContent, Section } from '@/types/illustration-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'IllustrationBranching');

/** Find spread in illustration.spreads by id */
export function findIllustrationSpread(state: SnapshotStore, spreadId: string) {
  return state.illustration.spreads.find((s) => s.id === spreadId);
}

// --- Shared cascade helpers ---

/** Remove branches pointing to given section IDs from all spreads. Auto-promote is_default if needed. */
export function removeBranchesForSections(state: SnapshotStore, sectionIds: string[]) {
  if (sectionIds.length === 0) return;
  const idSet = new Set(sectionIds);
  for (const spread of state.illustration.spreads) {
    if (!spread.branch_setting) continue;
    const removedDefault = spread.branch_setting.branches.some(
      (b) => idSet.has(b.section_id) && b.is_default
    );
    spread.branch_setting.branches = spread.branch_setting.branches.filter(
      (b) => !idSet.has(b.section_id)
    );
    // Auto-promote first branch to default if the default was removed
    if (removedDefault && spread.branch_setting.branches.length > 0 && !spread.branch_setting.branches.some((b) => b.is_default)) {
      spread.branch_setting.branches[0].is_default = true;
    }
  }
}

/** Validate section ranges: swap start/end if start index > end index after reorder */
export function validateSectionRanges(state: SnapshotStore) {
  const spreads = state.illustration.spreads;
  for (const section of state.illustration.sections) {
    const startIdx = spreads.findIndex((s) => s.id === section.start_spread_id);
    const endIdx = spreads.findIndex((s) => s.id === section.end_spread_id);
    if (startIdx !== -1 && endIdx !== -1 && startIdx > endIdx) {
      log.debug('validateSectionRanges', 'swap inverted range', { sectionId: section.id });
      const tmp = section.start_spread_id;
      section.start_spread_id = section.end_spread_id;
      section.end_spread_id = tmp;
    }
  }
}

// --- Section CRUD ---

export function addSectionAction(state: SnapshotStore, section: Section) {
  log.debug('addSection', 'add', { id: section.id, title: section.title });
  state.illustration.sections.push(section);
  state.sync.isDirty = true;
}

export function updateSectionAction(state: SnapshotStore, sectionId: string, updates: Partial<Omit<Section, 'id'>>) {
  const idx = state.illustration.sections.findIndex((s) => s.id === sectionId);
  if (idx !== -1) {
    log.debug('updateSection', 'update', { sectionId, fields: Object.keys(updates) });
    Object.assign(state.illustration.sections[idx], updates);
    state.sync.isDirty = true;
  }
}

export function deleteSectionAction(state: SnapshotStore, sectionId: string) {
  log.debug('deleteSection', 'delete', { sectionId });
  state.illustration.sections = state.illustration.sections.filter((s) => s.id !== sectionId);

  // Cascade: remove branches referencing this section, keep branch_setting intact (user deletes manually)
  removeBranchesForSections(state, [sectionId]);

  state.sync.isDirty = true;
}

// --- Navigation (next_spread_id on spread) ---

export function setNextSpreadIdAction(state: SnapshotStore, spreadId: string, nextSpreadId: string | null) {
  log.debug('setNextSpreadId', 'set', { spreadId, nextSpreadId });
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    spread.next_spread_id = nextSpreadId;
    state.sync.isDirty = true;
  }
}

export function clearNextSpreadIdAction(state: SnapshotStore, spreadId: string) {
  log.debug('clearNextSpreadId', 'clear', { spreadId });
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    delete spread.next_spread_id;
    state.sync.isDirty = true;
  }
}

// --- Branch Setting ---

export function setBranchSettingAction(state: SnapshotStore, spreadId: string, setting: BranchSetting) {
  log.debug('setBranchSetting', 'set', { spreadId, branchCount: setting.branches.length });
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    spread.branch_setting = setting;
    state.sync.isDirty = true;
  }
}

export function clearBranchSettingAction(state: SnapshotStore, spreadId: string) {
  log.debug('clearBranchSetting', 'clear', { spreadId });
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    delete spread.branch_setting;
    state.sync.isDirty = true;
  }
}

// --- Branch CRUD ---

export function addBranchAction(state: SnapshotStore, spreadId: string, branch: Branch) {
  log.debug('addBranch', 'add', { spreadId, sectionId: branch.section_id });
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    if (!spread.branch_setting) {
      spread.branch_setting = { branches: [] };
    }
    spread.branch_setting.branches.push(branch);
    state.sync.isDirty = true;
  }
}

export function updateBranchAction(state: SnapshotStore, spreadId: string, branchIndex: number, updates: Partial<Branch>) {
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    const branches = spread.branch_setting?.branches;
    if (branches && branchIndex >= 0 && branchIndex < branches.length) {
      log.debug('updateBranch', 'update', { spreadId, branchIndex, fields: Object.keys(updates) });
      Object.assign(branches[branchIndex], updates);
      state.sync.isDirty = true;
    }
  }
}

export function deleteBranchAction(state: SnapshotStore, spreadId: string, branchIndex: number) {
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    const bs = spread.branch_setting;
    if (bs && branchIndex >= 0 && branchIndex < bs.branches.length) {
      const wasDefault = bs.branches[branchIndex].is_default;
      log.debug('deleteBranch', 'delete', { spreadId, branchIndex });
      bs.branches.splice(branchIndex, 1);
      if (wasDefault && bs.branches.length > 0 && !bs.branches.some((b) => b.is_default)) {
        bs.branches[0].is_default = true;
      }
      state.sync.isDirty = true;
    }
  }
}

export function reorderBranchesAction(state: SnapshotStore, spreadId: string, fromIndex: number, toIndex: number) {
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    const branches = spread.branch_setting?.branches;
    if (branches && fromIndex >= 0 && toIndex >= 0 && fromIndex < branches.length && toIndex < branches.length) {
      log.debug('reorderBranches', 'reorder', { spreadId, fromIndex, toIndex });
      const [removed] = branches.splice(fromIndex, 1);
      branches.splice(toIndex, 0, removed);
      state.sync.isDirty = true;
    }
  }
}

// --- Localization ---

export function updateBranchSettingLocaleAction(state: SnapshotStore, spreadId: string, languageKey: string, content: BranchLocalizedContent) {
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    if (!spread.branch_setting) {
      spread.branch_setting = { branches: [] };
    }
    log.debug('updateBranchSettingLocale', 'update', { spreadId, languageKey });
    (spread.branch_setting as Record<string, unknown>)[languageKey] = content;
    state.sync.isDirty = true;
  }
}

export function deleteBranchSettingLocaleAction(state: SnapshotStore, spreadId: string, languageKey: string) {
  const spread = findIllustrationSpread(state, spreadId);
  if (spread?.branch_setting) {
    log.debug('deleteBranchSettingLocale', 'delete', { spreadId, languageKey });
    delete (spread.branch_setting as Record<string, unknown>)[languageKey];
    state.sync.isDirty = true;
  }
}

export function updateBranchLocaleAction(state: SnapshotStore, spreadId: string, branchIndex: number, languageKey: string, content: BranchLocalizedContent) {
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    const branches = spread.branch_setting?.branches;
    if (branches && branchIndex >= 0 && branchIndex < branches.length) {
      log.debug('updateBranchLocale', 'update', { spreadId, branchIndex, languageKey });
      (branches[branchIndex] as Record<string, unknown>)[languageKey] = content;
      state.sync.isDirty = true;
    }
  }
}

export function deleteBranchLocaleAction(state: SnapshotStore, spreadId: string, branchIndex: number, languageKey: string) {
  const spread = findIllustrationSpread(state, spreadId);
  if (spread) {
    const branches = spread.branch_setting?.branches;
    if (branches && branchIndex >= 0 && branchIndex < branches.length) {
      log.debug('deleteBranchLocale', 'delete', { spreadId, branchIndex, languageKey });
      delete (branches[branchIndex] as Record<string, unknown>)[languageKey];
      state.sync.isDirty = true;
    }
  }
}
