// use-crop-ownership.test.ts — Resolution of cross-batch ownership state per
// `(spread_id, layer_id)`. Pure derivation — drives the badge/dim/take-back UI
// in the AFTER pane.

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type {
  Remix,
  RemixCropSheet,
  RemixMix,
  SwapResult,
  SwapResultCrop,
} from '@/types/remix';
import { useCropOwnership } from './use-crop-ownership';

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeCrop(
  spreadId: string,
  layerId: string,
  isFinal?: boolean,
): SwapResultCrop {
  const base: SwapResultCrop = {
    spread_id: spreadId,
    id: layerId,
    geometry: { x: 0, y: 0, w: 10, h: 10 },
    media_url: `u://${spreadId}/${layerId}`,
    tags: [],
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
    crops: [],
  };
}

function makeBatch(id: string, order: number, sheets: RemixCropSheet[]): RemixMix {
  return { id, order, name: `Batch ${order}`, crop_sheets: sheets };
}

function makeRemix(mixes: RemixMix[]): Remix {
  return {
    id: 'r1',
    snapshot_id: 's1',
    name: 'Test Remix',
    remix_config: {} as Remix['remix_config'],
    illustration: { spreads: [], sections: [] },
    characters: [],
    props: [],
    mixes,
    created_at: '2026-05-29T00:00:00Z',
    updated_at: '2026-05-29T00:00:00Z',
  };
}

describe('useCropOwnership', () => {
  it('T1: null remix → empty map, getOwnership returns uncovered', () => {
    const { result } = renderHook(() => useCropOwnership(null, null));
    expect(result.current.ownerMap.size).toBe(0);
    expect(result.current.getOwnership('s1', 'l1')).toEqual({
      state: 'uncovered',
    });
  });

  it('T2: 1 batch 1 final → owned-current vs owned-foreign by currentBatchId', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ]);

    const currentMatch = renderHook(() => useCropOwnership(remix, 'b1')).result.current;
    expect(currentMatch.getOwnership('s1', 'l1')).toMatchObject({
      state: 'owned-current',
      ownerBatchId: 'b1',
    });

    const currentMiss = renderHook(() => useCropOwnership(remix, 'b9')).result.current;
    expect(currentMiss.getOwnership('s1', 'l1')).toMatchObject({
      state: 'owned-foreign',
      ownerBatchId: 'b1',
    });
  });

  it('T3: 2 batches, B claims → owner depends on currentBatchId', () => {
    const remix = makeRemix([
      makeBatch('A', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
      makeBatch('B', 2, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ]);

    const fromA = renderHook(() => useCropOwnership(remix, 'A')).result.current;
    expect(fromA.getOwnership('s1', 'l1')).toMatchObject({
      state: 'owned-foreign',
      ownerBatchId: 'B',
      ownerBatchName: 'Batch 2',
    });

    const fromB = renderHook(() => useCropOwnership(remix, 'B')).result.current;
    expect(fromB.getOwnership('s1', 'l1')).toMatchObject({
      state: 'owned-current',
      ownerBatchId: 'B',
    });
  });

  it('null currentBatchId → owner always owned-foreign (no batch match)', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ]);
    const { result } = renderHook(() => useCropOwnership(remix, null));
    expect(result.current.getOwnership('s1', 'l1')).toMatchObject({
      state: 'owned-foreign',
    });
  });

  it('unknown key → uncovered', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ]);
    const { result } = renderHook(() => useCropOwnership(remix, 'b1'));
    expect(result.current.getOwnership('sX', 'lX')).toEqual({ state: 'uncovered' });
  });
});
