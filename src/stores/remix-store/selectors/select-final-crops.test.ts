// select-final-crops.test.ts — pure-logic unit tests for the per-stage
// `is_final` mutex selectors (resolveFinalCrops / findUncoveredLayers /
// reconcileOrphanFinals). No store, no React.
// ⚡2026-06-12 — Inject reads `upscales[]` STRICT: remix fixtures place the
// batch rows on `upscales` (the row-level helpers stay column-agnostic).

import { describe, it, expect } from 'vitest';
import type { Remix, RemixCropSheet, RemixMix, SwapResult, SwapResultCrop } from '@/types/remix';
import {
  applyTakeFinalBack,
  findUncoveredLayers,
  needsMigration,
  reconcileOrphanFinals,
  resolveFinalCrops,
} from './select-final-crops';

// ── Fixture builders ─────────────────────────────────────────────────────────

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

function makeRemix(rows: RemixMix[]): Remix {
  // Inject source = `upscales[]` (strict — validation S1).
  return {
    id: 'r1',
    snapshot_id: 's1',
    name: 'Test Remix',
    remix_config: {} as Remix['remix_config'],
    illustration: { spreads: [], sections: [] },
    characters: [],
    props: [],
    mixes: [],
    rmbgs: [],
    upscales: rows,
    sprites: [],
    created_at: '2026-05-29T00:00:00Z',
    updated_at: '2026-05-29T00:00:00Z',
  };
}

// ── resolveFinalCrops ────────────────────────────────────────────────────────

describe('resolveFinalCrops', () => {
  it('T1: empty remix → empty output', () => {
    expect(resolveFinalCrops(makeRemix([]))).toEqual([]);
    expect(resolveFinalCrops(null)).toEqual([]);
  });

  it('T2: 1 batch 1 sheet 2 crops both final → 2 entries', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [
        makeSheet([
          makeSwapResult([makeCrop('s1', 'l1', true), makeCrop('s1', 'l2', true)]),
        ]),
      ]),
    ]);
    const out = resolveFinalCrops(remix);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.batch_id === 'b1')).toBe(true);
  });

  it('T3: 2 batches overlap key, B (higher order) claims', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
      makeBatch('b2', 2, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ]);
    const out = resolveFinalCrops(remix);
    expect(out).toEqual([
      expect.objectContaining({ spread_id: 's1', layer_id: 'l1', batch_id: 'b2' }),
    ]);
    expect(findUncoveredLayers(remix)).toEqual([]);
  });

  it('T5a: >1 finals same key (invariant breach) — picks highest order, no throw', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
      makeBatch('b2', 2, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ]);
    const out = resolveFinalCrops(remix);
    expect(out).toHaveLength(1);
    expect(out[0].batch_id).toBe('b2');
  });

  it('T9: history is_selected=false NOT included', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [
        makeSheet([
          makeSwapResult([makeCrop('s1', 'l1', true)], false), // history
          makeSwapResult([makeCrop('s1', 'l1', true)], true), // current
        ]),
      ]),
    ]);
    const out = resolveFinalCrops(remix);
    expect(out).toHaveLength(1);
  });
});

// ── findUncoveredLayers ──────────────────────────────────────────────────────

describe('findUncoveredLayers', () => {
  it('T10: 3 positions, 2 claimed, 1 uncovered → 1 entry with candidates', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [
        makeSheet([
          makeSwapResult([
            makeCrop('s1', 'l1', true), // claimed
            makeCrop('s2', 'l2', true), // claimed
            makeCrop('s3', 'l3'), // uncovered (no is_final)
          ]),
        ]),
      ]),
      makeBatch('b2', 2, [makeSheet([makeSwapResult([makeCrop('s3', 'l3')])])]),
    ]);
    const out = findUncoveredLayers(remix);
    expect(out).toEqual([
      expect.objectContaining({
        spread_id: 's3',
        layer_id: 'l3',
        candidate_batches: expect.arrayContaining(['b1', 'b2']),
      }),
    ]);
    expect(out[0].candidate_batches).toHaveLength(2);
  });

  it('history is_selected=false not included in uncovered allKeys', () => {
    const remix = makeRemix([
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
      makeBatch('b2', 2, [
        makeSheet([makeSwapResult([makeCrop('s9', 'l9')], false)]), // history only
      ]),
    ]);
    expect(findUncoveredLayers(remix)).toEqual([]);
  });
});

// ── reconcileOrphanFinals ────────────────────────────────────────────────────

describe('reconcileOrphanFinals', () => {
  it('T4: 2 batches overlap, NO crop is_final → claim newest (highest order)', () => {
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
      makeBatch('b2', 2, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
    ];
    const result = reconcileOrphanFinals(mixes);
    expect(result.changed).toBe(true);
    expect(result.log.claimed).toBe(1);
    expect(result.log.defensiveCleared).toBe(0);
    expect(result.log.dropped).toBe(0);
    // Highest order = b2 → b2's crop wins.
    expect(
      result.mixes[1].crop_sheets[0].swap_results[0].crops[0].is_final,
    ).toBe(true);
    expect(
      result.mixes[0].crop_sheets[0].swap_results[0].crops[0].is_final,
    ).toBe(false);
    // Original not mutated.
    expect(mixes[0].crop_sheets[0].swap_results[0].crops[0].is_final).toBeUndefined();
  });

  it('T5b: >1 finals same key (invariant breach) → defensive clear losers, log warn', () => {
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
      makeBatch('b2', 2, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ];
    const result = reconcileOrphanFinals(mixes);
    expect(result.changed).toBe(true);
    expect(result.log.defensiveCleared).toBe(1);
    expect(
      result.mixes[1].crop_sheets[0].swap_results[0].crops[0].is_final,
    ).toBe(true);
    expect(
      result.mixes[0].crop_sheets[0].swap_results[0].crops[0].is_final,
    ).toBe(false);
  });

  it('T6: orphan after delete — winner from remaining batches by highest order', () => {
    // Simulates state after "deleted" the batch that had the final (b3) →
    // only b1 + b2 remain. Both have the crop, neither has is_final.
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
      makeBatch('b2', 5, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
    ];
    const result = reconcileOrphanFinals(mixes);
    expect(result.changed).toBe(true);
    expect(result.log.claimed).toBe(1);
    expect(
      result.mixes[1].crop_sheets[0].swap_results[0].crops[0].is_final,
    ).toBe(true);
  });

  it('T7: no candidates at all → dropped count > 0 is unreachable here', () => {
    // "dropped" means the key has zero candidates — but the loop builds
    // key2candidates from any crop seen, so dropped is structurally always 0.
    // We assert that contract.
    const mixes = [makeBatch('b1', 1, [makeSheet([])])];
    const result = reconcileOrphanFinals(mixes);
    expect(result.changed).toBe(false);
    expect(result.log.dropped).toBe(0);
  });

  it('T8: idempotency — 2nd call changed=false', () => {
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
      makeBatch('b2', 2, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
    ];
    const first = reconcileOrphanFinals(mixes);
    expect(first.changed).toBe(true);
    const second = reconcileOrphanFinals(first.mixes);
    expect(second.changed).toBe(false);
    expect(second.log).toEqual({ claimed: 0, defensiveCleared: 0, dropped: 0 });
    // Returns the same reference when no change.
    expect(second.mixes).toBe(first.mixes);
  });

  it('Migration mode: legacy (no is_final on any crop) → auto-claim newest per position', () => {
    const mixes = [
      makeBatch('b1', 1, [
        makeSheet([
          makeSwapResult([makeCrop('s1', 'l1'), makeCrop('s2', 'l2')]),
        ]),
      ]),
      makeBatch('b2', 2, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
    ];
    const result = reconcileOrphanFinals(mixes);
    expect(result.changed).toBe(true);
    expect(result.log.claimed).toBe(2);
    // s1/l1 → b2 (higher order); s2/l2 → b1 (only candidate).
    expect(
      result.mixes[1].crop_sheets[0].swap_results[0].crops[0].is_final,
    ).toBe(true);
    expect(
      result.mixes[0].crop_sheets[0].swap_results[0].crops[0].is_final,
    ).toBe(false); // s1/l1 cleared in b1
    expect(
      result.mixes[0].crop_sheets[0].swap_results[0].crops[1].is_final,
    ).toBe(true); // s2/l2 only in b1
  });

  it('Tie-break: same order → lex on batch.id (deterministic)', () => {
    const mixes = [
      makeBatch('zzz', 5, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
      makeBatch('aaa', 5, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
    ];
    const result = reconcileOrphanFinals(mixes);
    expect(result.changed).toBe(true);
    // Lex smaller id wins on tie → 'aaa'.
    const winnerEntry = resolveFinalCrops(makeRemix(result.mixes))[0];
    expect(winnerEntry.batch_id).toBe('aaa');
  });
});

// ── needsMigration ───────────────────────────────────────────────────────────

describe('needsMigration', () => {
  it('false on empty mixes', () => {
    expect(needsMigration([])).toBe(false);
    expect(needsMigration(null)).toBe(false);
  });

  it('false when every sheet selected swap_result has ≥1 is_final=true', () => {
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ];
    expect(needsMigration(mixes)).toBe(false);
  });

  it('true when a selected swap_result has crops but none final', () => {
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
    ];
    expect(needsMigration(mixes)).toBe(true);
  });

  it('false when a sheet has no selected swap_result', () => {
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')], false)])]),
    ];
    expect(needsMigration(mixes)).toBe(false);
  });

  it('true when ANY sheet is legacy (mixed cohort)', () => {
    const mixes = [
      makeBatch('b1', 1, [
        makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])]),
        makeSheet([makeSwapResult([makeCrop('s2', 'l2')])]), // legacy
      ]),
    ];
    expect(needsMigration(mixes)).toBe(true);
  });
});

// ── applyTakeFinalBack (R5 pure mutation) ─────────────────────────────────────

describe('applyTakeFinalBack', () => {
  it('happy path: claims crop in fromBatch, clears cross-batch siblings', () => {
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
      makeBatch('b2', 2, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ];
    const out = applyTakeFinalBack(mixes, 's1', 'l1', 'b1');
    expect(out).not.toBeNull();
    expect(out![0].crop_sheets[0].swap_results[0].crops[0].is_final).toBe(true);
    expect(out![1].crop_sheets[0].swap_results[0].crops[0].is_final).toBe(false);
    // Original untouched.
    expect(mixes[0].crop_sheets[0].swap_results[0].crops[0].is_final).toBeUndefined();
    expect(mixes[1].crop_sheets[0].swap_results[0].crops[0].is_final).toBe(true);
  });

  it('returns null when fromBatchId missing', () => {
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
    ];
    expect(applyTakeFinalBack(mixes, 's1', 'l1', 'b-missing')).toBeNull();
  });

  it('returns null when target crop missing in fromBatch', () => {
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s9', 'l9')])])]),
    ];
    expect(applyTakeFinalBack(mixes, 's1', 'l1', 'b1')).toBeNull();
  });

  it('idempotent: repeated call yields equivalent state', () => {
    const mixes = [
      makeBatch('b1', 1, [makeSheet([makeSwapResult([makeCrop('s1', 'l1')])])]),
      makeBatch('b2', 2, [makeSheet([makeSwapResult([makeCrop('s1', 'l1', true)])])]),
    ];
    const once = applyTakeFinalBack(mixes, 's1', 'l1', 'b1')!;
    const twice = applyTakeFinalBack(once, 's1', 'l1', 'b1')!;
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });

  it('ignores history (is_selected=false) when locating target', () => {
    const mixes = [
      makeBatch('b1', 1, [
        makeSheet([
          makeSwapResult([makeCrop('s1', 'l1')], false), // history
          makeSwapResult([makeCrop('s9', 'l9')], true), // current — no s1/l1
        ]),
      ]),
    ];
    // s1/l1 only exists in history → cannot be claimed by R5.
    expect(applyTakeFinalBack(mixes, 's1', 'l1', 'b1')).toBeNull();
  });
});

