// retouch-types.ts - Retouch phase container type
// Spreads and items reuse spread-types.ts (BaseSpread, SpreadImage, etc.)

import type { BaseSpread } from './spread-types';

export interface RetouchData {
  spreads: BaseSpread[];
}
