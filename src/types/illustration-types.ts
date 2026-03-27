// illustration-types.ts - Illustration phase container type
// Spreads and items reuse spread-types.ts (BaseSpread, SpreadImage, etc.)

import type { BaseSpread } from './spread-types';

export interface IllustrationData {
  spreads: BaseSpread[];
}
