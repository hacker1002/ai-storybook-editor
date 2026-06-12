// select-can-inject.test.ts — Unit tests for the Inject gate predicate.
// `selectCanInject(remix)` MUST be true iff there is ≥1 batch with a selected
// `swap_result` yielding an injectable `is_final` winner crop (it mirrors
// `injectFinalCrops`'s precondition / `resolveFinalCrops(remix).length > 0`).

import { describe, expect, it } from 'vitest';
import type {
  Remix,
  RemixCropSheet,
  RemixMix,
  SwapResult,
  SwapResultCrop,
} from '@/types/remix';
import { selectCanInject } from './select-final-crops';

// ── Fixture builders (shape mirrors select-final-crops.test.ts) ───────────────

function makeCrop(
  spreadId: string,
  layerId: string,
  isFinal?: boolean,
): SwapResultCrop {
  // LEAN swap crop (⚡2026-06-12) — no geometry/tags.
  const base: SwapResultCrop = {
    spread_id: spreadId,
    id: layerId,
    media_url: `u://${spreadId}/${layerId}`,
  };
  if (isFinal !== undefined) base.is_final = isFinal;
  return base;
}

function makeSwapResult(crops: SwapResultCrop[], isSelected = true): SwapResult {
  return {
    media_url: 'u://sheet',
    created_time: '2026-05-29T00:00:00Z',
    is_selected: isSelected,
    crops,
  };
}

function makeSheet(swapResults: SwapResult[] = []): RemixCropSheet {
  return {
    title: 'sheet',
    sheet_geometry: { width: 100, height: 100 },
    image_url: '',
    swap_results: swapResults,
    original_crops: [],
  };
}

function makeBatch(id: string, order: number, sheets: RemixCropSheet[]): RemixMix {
  return { id, order, name: `Batch ${order}`, crop_sheets: sheets };
}

// Only `upscales` is read by the gate (⚡2026-06-12 Inject strict source);
// cast the minimal shape.
function makeRemix(rows: RemixMix[]): Remix {
  return { upscales: rows } as Remix;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('selectCanInject', () => {
  it('returns false for null/undefined remix', () => {
    expect(selectCanInject(null)).toBe(false);
    expect(selectCanInject(undefined)).toBe(false);
  });

  it('returns false when there are no batches', () => {
    expect(selectCanInject(makeRemix([]))).toBe(false);
  });

  it('returns false when a batch has a selected swap_result but no is_final winner crop (swap done, not yet finalized)', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', false)])])]),
    ]);
    expect(selectCanInject(remix)).toBe(false);
  });

  it('returns false when the only is_final crop lives in a non-selected (history) swap_result', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [
        makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)], false)]),
      ]),
    ]);
    expect(selectCanInject(remix)).toBe(false);
  });

  it('returns true when ≥1 batch has a selected swap_result with an is_final winner crop', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ]);
    expect(selectCanInject(remix)).toBe(true);
  });

  it('returns true if any batch qualifies even when another has no final yet', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', false)])])]),
      makeBatch('b2', 2, [makeSheet([makeSwapResult([makeCrop('s2', 'l2', true)])])]),
    ]);
    expect(selectCanInject(remix)).toBe(true);
  });
});
