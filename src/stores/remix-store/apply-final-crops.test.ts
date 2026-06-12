import { describe, it, expect } from 'vitest';
import { applyFinalCrops } from './apply-final-crops';
import type { FinalCropEntry } from './selectors/select-final-crops';
import type { RemixIllustration, RemixSpread } from '@/types/remix';
import type { Geometry, SpreadImage } from '@/types/spread-types';

const NOW = '2026-05-30T00:00:00.000Z';
const GEO: Geometry = { x: 0, y: 0, w: 100, h: 100 };

function layer(over: Partial<SpreadImage> = {}): SpreadImage {
  return {
    id: 'L1',
    geometry: GEO,
    media_url: 'sketch://L1', // sketch — must never be touched
    illustrations: [],
    ...over,
  };
}

function spread(id: string, images: SpreadImage[]): RemixSpread {
  return {
    id,
    pages: [],
    images,
    textboxes: [],
  } as unknown as RemixSpread;
}

function illustration(spreads: RemixSpread[]): RemixIllustration {
  return { spreads, sections: [] };
}

function finalCrop(
  spreadId: string,
  layerId: string,
  mediaUrl: string,
): FinalCropEntry {
  // LEAN FinalCropEntry (⚡2026-06-12) — Inject only consumes media_url.
  return {
    spread_id: spreadId,
    layer_id: layerId,
    media_url: mediaUrl,
    batch_id: 'b1',
  };
}

describe('applyFinalCrops', () => {
  it('swapped layer: writes final_hires_media_url + collapses illustrations', () => {
    const illu = illustration([
      spread('S1', [
        layer({
          id: 'L1',
          illustrations: [
            { media_url: 'old-a', created_time: 't0', is_selected: false },
            { media_url: 'old-b', created_time: 't1', is_selected: true },
          ],
        }),
      ]),
    ]);
    const finals = [finalCrop('S1', 'L1', 'swapped://final')];

    const res = applyFinalCrops(illu, finals, NOW);
    const out = res.spreads[0].images[0];

    expect(out.final_hires_media_url).toBe('swapped://final');
    expect(out.illustrations).toEqual([
      { media_url: 'swapped://final', created_time: NOW, is_selected: true },
    ]);
    expect(out.media_url).toBe('sketch://L1'); // sketch untouched
    expect(res.appliedCount).toBe(1);
    expect(res.collapsedCount).toBe(1);
    expect(res.spreadCount).toBe(1);
  });

  it('unswapped layer with >1 illustrations: slims to the selected one', () => {
    const illu = illustration([
      spread('S1', [
        layer({
          id: 'L1',
          illustrations: [
            { media_url: 'keep-me', created_time: 't0', is_selected: true },
            { media_url: 'drop-me', created_time: 't1', is_selected: false },
          ],
        }),
      ]),
    ]);

    const res = applyFinalCrops(illu, [], NOW);
    const out = res.spreads[0].images[0];

    expect(out.illustrations).toEqual([
      { media_url: 'keep-me', created_time: 't0', is_selected: true },
    ]);
    expect(out.final_hires_media_url).toBeUndefined(); // not set when unswapped
    expect(res.appliedCount).toBe(0);
    expect(res.collapsedCount).toBe(1);
  });

  it('unswapped layer with >1 illustrations and none selected: keeps first', () => {
    const illu = illustration([
      spread('S1', [
        layer({
          id: 'L1',
          illustrations: [
            { media_url: 'first', created_time: 't0', is_selected: false },
            { media_url: 'second', created_time: 't1', is_selected: false },
          ],
        }),
      ]),
    ]);

    const res = applyFinalCrops(illu, [], NOW);
    expect(res.spreads[0].images[0].illustrations).toEqual([
      { media_url: 'first', created_time: 't0', is_selected: false },
    ]);
    expect(res.collapsedCount).toBe(1);
  });

  it('uncovered layer (no crop, single illustration): left unchanged', () => {
    const illu = illustration([
      spread('S1', [
        layer({
          id: 'L1',
          illustrations: [
            { media_url: 'only', created_time: 't0', is_selected: true },
          ],
        }),
      ]),
    ]);

    const res = applyFinalCrops(illu, [], NOW);
    expect(res.spreads[0].images[0].illustrations).toEqual([
      { media_url: 'only', created_time: 't0', is_selected: true },
    ]);
    expect(res.appliedCount).toBe(0);
    expect(res.collapsedCount).toBe(0);
  });

  it('does NOT mutate the input illustration (purity)', () => {
    const illu = illustration([
      spread('S1', [layer({ id: 'L1', illustrations: [] })]),
    ]);
    const finals = [finalCrop('S1', 'L1', 'swapped://x')];

    applyFinalCrops(illu, finals, NOW);

    expect(illu.spreads[0].images[0].final_hires_media_url).toBeUndefined();
    expect(illu.spreads[0].images[0].illustrations).toEqual([]);
  });

  it('idempotent: re-applying the same finals yields the same result', () => {
    const illu = illustration([
      spread('S1', [layer({ id: 'L1', illustrations: [] })]),
    ]);
    const finals = [finalCrop('S1', 'L1', 'swapped://y')];

    const first = applyFinalCrops(illu, finals, NOW);
    const second = applyFinalCrops(illustration(first.spreads), finals, NOW);

    expect(second.spreads[0].images[0]).toEqual(first.spreads[0].images[0]);
    expect(second.appliedCount).toBe(1);
  });

  it('handles empty spreads / empty images', () => {
    expect(applyFinalCrops(illustration([]), [], NOW)).toEqual({
      spreads: [],
      appliedCount: 0,
      collapsedCount: 0,
      spreadCount: 0,
    });

    const res = applyFinalCrops(illustration([spread('S1', [])]), [], NOW);
    expect(res.spreadCount).toBe(1);
    expect(res.appliedCount).toBe(0);
  });
});
