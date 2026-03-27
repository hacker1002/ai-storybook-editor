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

export interface CharacterVoice {
  name: string;
  key: string;
  stability: number;
  clarity: number;
  similarity: number;
  style_exaggeration: number;
  speaker_boost: boolean;
  system_voice: string;
  media_url: string;
}

export interface Character {
  order: number;
  name: string;
  key: string;
  basic_info: CharacterBasicInfo;
  personality: CharacterPersonality;
  variants: CharacterVariant[];
  voices: CharacterVoice[];
  crop_sheets: CropSheet[];
}
