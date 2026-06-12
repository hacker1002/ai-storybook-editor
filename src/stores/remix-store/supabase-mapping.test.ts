// supabase-mapping.test.ts — read-time shim for pre-2026-06-12 JSONB rows
// (crop_sheets[].crops[] → original_crops[] rename, no DB migration).

import { describe, expect, it } from 'vitest';
import { mapRowToRemix } from './supabase-mapping';

function makeRawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'remix-1',
    snapshot_id: 'snap-1',
    created_at: '2026-06-12T00:00:00Z',
    updated_at: '2026-06-12T00:00:00Z',
    ...overrides,
  };
}

const LEGACY_CROP = {
  spread_id: 'sp-1',
  id: 'layer-1',
  media_url: 'https://example.com/a.png',
  tags: [],
  geometry: { x: 0, y: 0, width: 10, height: 10 },
};

function legacyBatch(batchId: string) {
  return {
    id: batchId,
    order: 1,
    crop_sheets: [
      {
        title: 'Sheet 1',
        sheet_geometry: { width: 100, height: 100 },
        image_url: null,
        swap_results: [],
        crops: [LEGACY_CROP], // pre-rename key
      },
    ],
  };
}

describe('mapRowToRemix — legacy crops[] shim', () => {
  it('renames crops[] → original_crops[] on every batch column', () => {
    const remix = mapRowToRemix(
      makeRawRow({
        mixes: [legacyBatch('m1')],
        rmbgs: [legacyBatch('r1')],
        upscales: [legacyBatch('u1')],
        sprites: [legacyBatch('s1')],
      })
    );

    for (const rows of [remix.mixes, remix.rmbgs, remix.upscales, remix.sprites]) {
      const sheet = rows[0].crop_sheets[0] as unknown as {
        original_crops?: unknown[];
        crops?: unknown;
      };
      expect(sheet.original_crops).toEqual([LEGACY_CROP]);
      expect(sheet.crops).toBeUndefined();
    }
  });

  it('leaves modern rows untouched and prefers original_crops when both keys exist', () => {
    const modernSheet = {
      title: 'Sheet 1',
      sheet_geometry: { width: 100, height: 100 },
      image_url: null,
      swap_results: [],
      original_crops: [LEGACY_CROP],
    };
    const bothKeysSheet = {
      ...modernSheet,
      original_crops: [],
      crops: [LEGACY_CROP],
    };
    const remix = mapRowToRemix(
      makeRawRow({
        mixes: [
          { id: 'm1', order: 1, crop_sheets: [modernSheet] },
          { id: 'm2', order: 2, crop_sheets: [bothKeysSheet] },
        ],
      })
    );

    const [modern, both] = remix.mixes.map(
      (m) => m.crop_sheets[0] as unknown as { original_crops?: unknown[]; crops?: unknown }
    );
    expect(modern.original_crops).toEqual([LEGACY_CROP]);
    expect(both.original_crops).toEqual([]);
    expect(both.crops).toEqual([LEGACY_CROP]); // not deleted when target already set
  });

  it('coalesces malformed/absent columns to empty arrays', () => {
    const remix = mapRowToRemix(makeRawRow({ mixes: 'garbage', sprites: null }));
    expect(remix.mixes).toEqual([]);
    expect(remix.rmbgs).toEqual([]);
    expect(remix.upscales).toEqual([]);
    expect(remix.sprites).toEqual([]);
  });
});
