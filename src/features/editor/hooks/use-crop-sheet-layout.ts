// use-crop-sheet-layout.ts — Thin memo wrapper around computeCropSheetLayout.
//
// The engine is pure and fast (N < ~64, < 1ms), so the hook holds no state and
// runs no effect — it just memoizes the engine call.
//
// IMPORTANT: `crops` is compared by reference. Callers must pass a stable
// `crops` array ref (e.g. via their own useMemo) or the memo is defeated and
// the engine recomputes every render.
//
// Spec: ai-storybook-design/component/editor-page/remix-creative-space/05-05-crop-sheet-layout-engine.md §3.3

import { useMemo } from 'react';
import {
  computeCropSheetLayout,
  type CropInput,
  type LayoutConfig,
  type CropSheetLayoutResult,
} from '@/utils/crop-sheet-layout-engine';

/**
 * Memoized crop sheet layout. Recomputes only when `crops` ref or any scalar
 * config field changes.
 *
 * Config is destructured into primitives before `useMemo` so the memo callback
 * closes over scalars (not the `config` object ref) — keeps recompute keyed on
 * value changes and satisfies React Compiler's memoization preservation.
 */
export function useCropSheetLayout(
  crops: CropInput[],
  config: LayoutConfig,
): CropSheetLayoutResult {
  const { sheetCount, gutterX, gutterY, landscapeTolerance } = config;
  const spreadWidth = config.spread.width;
  const spreadHeight = config.spread.height;

  return useMemo(
    () =>
      computeCropSheetLayout(crops, {
        sheetCount,
        spread: { width: spreadWidth, height: spreadHeight },
        gutterX,
        gutterY,
        landscapeTolerance,
      }),
    [crops, sheetCount, spreadWidth, spreadHeight, gutterX, gutterY, landscapeTolerance],
  );
}
