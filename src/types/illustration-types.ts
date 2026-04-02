// illustration-types.ts - Illustration phase container type
// Spreads and items reuse spread-types.ts (BaseSpread, SpreadImage, etc.)

import type { BaseSpread } from './spread-types';

/** Localized content for branch setting title or branch option */
export interface BranchLocalizedContent {
  title: string;
  audio_url?: string;
}

/** A single branch option pointing to a section */
export interface Branch {
  section_id: string;
  is_default: boolean;
  image_url?: string;
  [language_key: string]: BranchLocalizedContent | string | boolean | undefined;
}

/** Branch setting for a spread — contains localized question title + branch options */
export interface BranchSetting {
  branches: Branch[];
  [language_key: string]: BranchLocalizedContent | Branch[] | undefined;
}

/** A section — a contiguous group of spreads forming a story branch */
export interface Section {
  id: string;
  title: string;
  start_spread_id: string;
  end_spread_id: string;
  /** Where to navigate after this section ends. Undefined = follow array order. */
  next_spread_id?: string | null;
}

export interface IllustrationData {
  spreads: BaseSpread[];
  sections: Section[];
}
