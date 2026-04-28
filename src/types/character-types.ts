// character-types.ts - TypeScript interfaces for Character entities (matches DB schema)

import type { Illustration, ImageReference, CropSheet } from './prop-types';

/** 0 = base variant, 1 = user-created variant */
export type CharacterVariantType = 0 | 1;

export interface CharacterBasicInfo {
  description: string;
  gender: string;
  age: string;
  category_id: string;
  role: string;
}

export interface CharacterPersonality {
  core_essence: string;
  flaws: string;
  emotions: string;
  reactions: string;
  desires: string;
  likes: string;
  fears: string;
  contradictions: string;
}

export interface CharacterAppearance {
  height: number;
  hair: string;
  eyes: string;
  face: string;
  build: string;
}

export interface CharacterVariant {
  name: string;
  key: string;
  type: CharacterVariantType;
  appearance: CharacterAppearance;
  visual_description: string;
  illustrations: Illustration[];
  image_references: ImageReference[];
}

/**
 * Per-language preview entry inside `CharacterVoiceSetting`.
 * Language keys match `^[a-z]{2}_[A-Z]{2}$`; value holds last-generated preview audio URL.
 */
export interface CharacterVoicePreviewEntry {
  media_url: string | null;
}

/**
 * Hybrid shape mirroring `NarratorSettings`:
 * - Literal inference keys: voice_id / model / stability / similarity / speed / exaggeration / speaker_boost
 * - Language keys match `^[a-z]{2}_[A-Z]{2}$` → `CharacterVoicePreviewEntry`
 */
export type CharacterVoiceSetting = {
  voice_id: string | null;
  model: string;
  stability: number;
  similarity: number;
  speed: number;
  exaggeration: number;
  speaker_boost: boolean;
} & {
  [languageKey: string]:
    | CharacterVoicePreviewEntry
    | string
    | number
    | boolean
    | null;
};

export interface Character {
  order: number;
  name: string;
  key: string;
  basic_info: CharacterBasicInfo;
  personality: CharacterPersonality;
  variants: CharacterVariant[];
  voice_setting: CharacterVoiceSetting | null;
  crop_sheets: CropSheet[];
}
