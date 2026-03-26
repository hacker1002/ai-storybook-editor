// location-types.ts - TypeScript interfaces for Location entities (matches DB schema)

import type { ImageReference } from './prop-types';

/** 0 = real location, 1 = fictional/extraterrestrial */
export type LocationType = 0 | 1;

/** locations row from DB */
export interface Location {
  id: string;
  name: string;
  description: string | null;
  nation: string | null;
  city: string | null;
  type: LocationType;
  image_references: ImageReference[];
}
