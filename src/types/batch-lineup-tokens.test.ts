// batch-lineup-tokens.test.ts — Unit tests for batchLineupTokens (rev2). Derives
// the distinct `${object_key}/${variant_key}` lineup of a batch from its crop
// tags[] (the legacy persisted `mixes[].keys[]` identity is gone).

import { describe, it, expect } from 'vitest';
import { batchLineupTokens } from './remix';
import type { RemixBatch, CropEntry } from './remix';
import type { SpreadTag } from './spread-types';

function tag(objectKey: string, variantKey: string): SpreadTag {
  return { type: 'character', object_key: objectKey, variant_key: variantKey } as SpreadTag;
}

function crop(id: string, tags: SpreadTag[]): CropEntry {
  return {
    spread_id: 's1',
    id,
    layer_kind: 'image',
    spread_number: 1,
    aspect_ratio: '1:1',
    name: '',
    tags,
    media_url: `https://cdn/${id}.png`,
    geometry: { x: 0, y: 0, w: 10, h: 10 },
  };
}

function batch(crops: CropEntry[][]): RemixBatch {
  return {
    id: 'b1',
    order: 0,
    name: 'Batch 1',
    crop_sheets: crops.map((sheetCrops, i) => ({
      title: `sheet ${i + 1}`,
      sheet_geometry: { width: 100, height: 100 },
      image_url: '',
      swap_results: [],
      crops: sheetCrops,
    })),
    swapTask: { state: 'idle' },
  };
}

describe('batchLineupTokens', () => {
  it('unions tag tokens across all sheets/crops, distinct', () => {
    const b = batch([
      [crop('i1', [tag('c1', 'v1'), tag('c2', 'v1')])],
      [crop('i2', [tag('c1', 'v1')])], // c1/v1 repeats → deduped
    ]);
    expect(batchLineupTokens(b).sort()).toEqual(['c1/v1', 'c2/v1']);
  });

  it('treats different variant_keys of the same object as distinct tokens', () => {
    const b = batch([[crop('i1', [tag('c1', 'v1')]), crop('i2', [tag('c1', 'v2')])]]);
    expect(batchLineupTokens(b).sort()).toEqual(['c1/v1', 'c1/v2']);
  });

  it('returns [] for an empty batch', () => {
    expect(batchLineupTokens(batch([]))).toEqual([]);
    expect(batchLineupTokens(batch([[]]))).toEqual([]);
  });
});
