// stage-types.ts - TypeScript interfaces for Stage entities (matches DB schema)

import type { Illustration, ImageReference } from './prop-types';

/** 0 = base variant, 1 = user-created variant */
export type StageVariantType = 0 | 1;

export interface StageTemporal {
  era: string;
  season: string;
  weather: string;
  time_of_day: string;
}

export interface StageSensory {
  atmosphere: string;
  soundscape: string;
  lighting: string;
  color_palette: string;
}

export interface StageEmotional {
  mood: string;
}

export interface StageVariant {
  name: string;
  key: string;
  type: StageVariantType;
  visual_description: string;
  temporal: StageTemporal;
  sensory: StageSensory;
  emotional: StageEmotional;
  illustrations: Illustration[];
  image_references: ImageReference[];
}

export interface StageSound {
  name: string;
  key: string;
  description: string;
  media_url: string;
}

export interface Stage {
  order: number;
  name: string;
  key: string;
  location_id: string;
  variants: StageVariant[];
  sounds: StageSound[];
}
