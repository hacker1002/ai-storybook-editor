// compute-sketch-page-numbers.ts — page-number helper for the dedicated SketchSpreadCanvas.
// Every sketch spread occupies 2 physical pages in doc order (even a single 'full' backdrop),
// so the spread at doc index i renders page numbers left = 2*i+1, right = left+1.

import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'computeSketchPageNumbers');

export interface SketchPageNumbers {
  left: number;
  right: number;
}

/**
 * Doc-order page numbers for a sketch spread.
 * @param spreadIds ordered spread ids (doc order) — from `useSketchSpreadIds()`.
 * @param spreadId  the spread being rendered.
 * Unknown id (not in the list) falls back to 1/2 rather than negatives.
 */
export function computeSketchPageNumbers(
  spreadIds: string[],
  spreadId: string,
): SketchPageNumbers {
  const index = spreadIds.indexOf(spreadId);
  if (index < 0) {
    log.debug('computeSketchPageNumbers', 'spread not in list — fallback 1/2', { spreadId });
    return { left: 1, right: 2 };
  }
  const left = index * 2 + 1;
  return { left, right: left + 1 };
}
