// branch-types.ts - Shared types for BranchCreativeSpace feature

import type { Section, BranchSetting, Branch, BranchLocalizedContent } from '@/types/illustration-types';
import type { BaseSpread } from '@/types/spread-types';

export type { Section, BranchSetting, Branch, BranchLocalizedContent, BaseSpread };

// Add section flow state
export interface AddSectionState {
  selectedSpreadIds: string[];
  title: string;
}

// Draft branch for StoryBranchingModal
export interface DraftBranch {
  id: string;
  sectionId: string;
  imageUrl?: string;
  title: string;
  isDefault: boolean;
  _originalBranch?: Branch; // preserve original branch data for locale merge on save
}

// Sidebar list item — interleaved spreads and section headers
export type SidebarListItem =
  | { type: 'spread'; spread: BaseSpread; isChild: boolean; sectionId?: string }
  | { type: 'section'; section: Section; spreadCount: number };

// Grid layout item — free spreads and section groups
export type GridLayoutItem =
  | { type: 'free-spread'; spread: BaseSpread }
  | { type: 'section-group'; section: Section; spreads: BaseSpread[]; isExpanded: boolean };

// Section settings navigation mode (renamed 'default' to 'next-in-order' per validation)
export type NavigationMode = 'next-in-order' | 'specific-spread';
