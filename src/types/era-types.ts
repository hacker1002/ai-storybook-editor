// era-types.ts - TypeScript interfaces for Era entities (matches DB schema)

import type { ImageReference } from './prop-types';

/** eras row from DB */
export interface Era {
  id: string;
  name: string;
  description: string | null;
  image_references: ImageReference[];
}
