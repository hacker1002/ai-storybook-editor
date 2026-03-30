/** Localized content for branch setting title or branch option */
export interface BranchLocalizedContent {
  title: string;
  audio_url?: string;
}

/** A single branch option pointing to a section */
export interface Branch {
  section_id: string;
  image_url?: string;
  [language_key: string]: BranchLocalizedContent | string | undefined;
}

/** Branch setting for a spread — contains localized question title + branch options */
export interface BranchSetting {
  branches: Branch[];
  [language_key: string]: BranchLocalizedContent | Branch[] | undefined;
}

/** Navigation config for a single spread */
export interface SpreadNavigation {
  id: string;
  branch_setting?: BranchSetting;
  next_spread_id?: string | null;
}

/** A section — a contiguous group of spreads forming a story branch */
export interface Section {
  id: string;
  title: string;
  start_spread_id: string;
  end_spread_id: string;
}

/** Top-level spread_setting structure in snapshot */
export interface SpreadSetting {
  spreads: SpreadNavigation[];
  sections: Section[];
}

export const DEFAULT_SPREAD_SETTING: SpreadSetting = {
  spreads: [],
  sections: [],
};
