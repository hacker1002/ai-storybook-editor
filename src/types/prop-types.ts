// prop-types.ts - TypeScript interfaces for Prop entities (matches DB schema)

export type ContentTab = 'variants' | 'sounds' | 'crops';

export type PropType = 'narrative' | 'anchor';

/** 0 = base variant, 1 = user-created variant */
export type PropVariantType = 0 | 1;

export interface Illustration {
  media_url: string;
  created_time: string;
  is_selected: boolean;
}

export interface ImageReference {
  title: string;
  media_url: string;
}

export interface PropVariant {
  name: string;
  key: string;
  type: PropVariantType;
  visual_description: string;
  illustrations: Illustration[];
  image_references: ImageReference[];
}

export interface PropSound {
  name: string;
  key: string;
  description: string;
  media_url: string;
}

export interface Crop {
  spread_number: number;
  aspect_ratio: string;
  name: string;
  variant: string;
  media_url: string;
  geometry: { x: number; y: number; w: number; h: number };
  'z-index': number;
}

export interface CropSheet {
  title: string;
  image_url: string;
  crops: Crop[];
}

/** asset_categories row from DB. type: 1=human, 2=animal, 3=plant, 4=item */
export interface AssetCategory {
  id: string;
  name: string;
  type: number;
  description: string | null;
}

export interface Prop {
  order: number;
  name: string;
  key: string;
  category_id: string;
  type: PropType;
  variants: PropVariant[];
  sounds: PropSound[];
  crop_sheets: CropSheet[];
}
