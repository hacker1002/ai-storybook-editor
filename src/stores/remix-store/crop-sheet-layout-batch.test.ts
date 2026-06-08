// crop-sheet-layout-batch.test.ts — Unit tests for the rev2 batch lifecycle +
// relayout engine helpers (addBatch / removeBatch / relayoutBatchSheets) and the
// pure deriveBatchSwapTask selector helper.
//
// The engine helpers take a decoupled `RelayoutDeps` (set/get over an in-memory
// `{ remixes }` + a faithful `patchRemixCropSheets` replaceAll-mix impl) and
// persist via `@/apis/supabase`, which is mocked to a resolved no-error update.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase BEFORE importing the module under test (hoisted by vitest).
const updateEq = vi.fn(async () => ({ error: null as { message: string } | null }));
vi.mock('@/apis/supabase', () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: updateEq }) }),
  },
}));

import {
  addBatch,
  removeBatch,
  relayoutBatchSheets,
  currentCropsOfBatch,
  type RelayoutDeps,
} from './crop-sheet-layout';
import { deriveBatchSwapTask } from './selectors';
import type { CropSheetUpdate } from './types';
import type { CropEntry, Remix, RemixMix, RemixJob } from '@/types/remix';
import type { SpreadTag } from '@/types/spread-types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function tag(objectKey: string, variant = 'v1'): SpreadTag {
  return { type: 'character', object_key: objectKey, variant_key: variant } as SpreadTag;
}

/** Spread with one subject-tagged image so groupCropsForBatch yields crops. */
function spreadWithCrop(id: string, page: number, layerId: string, objectKey: string) {
  return {
    id,
    pages: [{ number: page, type: 'normal_page', layout: null, background: { color: '#fff', texture: null } }],
    images: [
      {
        id: layerId,
        media_url: `https://cdn/${layerId}.png`,
        aspect_ratio: '1:1',
        geometry: { x: 0, y: 0, w: 40, h: 40 },
        'z-index': 0,
        tags: [tag(objectKey)],
      },
    ],
    auto_pics: [],
    textboxes: [],
  };
}

/** Build a CropEntry matching the spread fixture (`spreadWithCrop`). Used to
 *  populate a batch lineup so `currentCropsOfBatch` returns non-empty subsets
 *  (rev6 `addBatch` subset path + `relayoutBatchSheets` per-batch scope). */
function makeCropEntry(spreadId: string, layerId: string, objectKey: string): CropEntry {
  return {
    spread_id: spreadId,
    id: layerId,
    layer_kind: 'image',
    spread_number: spreadId === 's1' ? 1 : 2,
    aspect_ratio: '1:1',
    name: 'v1',
    tags: [tag(objectKey)],
    media_url: `https://cdn/${layerId}.png`,
    geometry: { x: 0, y: 0, w: 0, h: 0 },
  };
}

/** A batch fixture that can carry a real `crops[]` lineup so rev6 subset filters
 *  + per-batch relayout have something to work with. `cropIds` defaults to the
 *  illustration's full set (`i1`, `i2`). Pass `[]` to simulate an empty batch. */
function makeBatch(
  id: string,
  order: number,
  name: string,
  withSwap = false,
  cropIds: Array<{ spreadId: string; layerId: string; objectKey: string }> = [
    { spreadId: 's1', layerId: 'i1', objectKey: 'c1' },
    { spreadId: 's2', layerId: 'i2', objectKey: 'c1' },
  ],
): RemixMix {
  return {
    id,
    order,
    name,
    crop_sheets: [
      {
        title: 'sheet 1',
        sheet_geometry: { width: 100, height: 100 },
        image_url: '',
        swap_results: withSwap
          ? [{ media_url: 'https://cdn/swap.png', created_time: 't', is_selected: true, crops: [] }]
          : [],
        crops: cropIds.map((c) => makeCropEntry(c.spreadId, c.layerId, c.objectKey)),
      },
    ],
  };
}

function makeRemix(mixes: RemixMix[]): Remix {
  return {
    id: 'remix-1',
    characters: [{ key: 'c1', name: 'C1', variants: [] }],
    props: [],
    mixes,
    illustration: {
      spreads: [spreadWithCrop('s1', 1, 'i1', 'c1'), spreadWithCrop('s2', 2, 'i2', 'c1')],
      sections: [],
    },
  } as unknown as Remix;
}

/** In-memory deps over a mutable `{ remixes }` with a faithful replaceAll-mix
 *  patchRemixCropSheets (mirrors crud-slice mix branch keyed on batch id). */
function makeDeps(remix: Remix): RelayoutDeps & { state: { remixes: Remix[] } } {
  const state = { remixes: [remix] };
  return {
    state,
    dimension: null,
    set: (updater) => {
      const next = updater(state);
      state.remixes = next.remixes;
    },
    get: () => state,
    patchRemixCropSheets: (remixId: string, updates: CropSheetUpdate[]) => {
      state.remixes = state.remixes.map((r) => {
        if (r.id !== remixId) return r;
        let mixes = r.mixes;
        for (const u of updates) {
          if (u.kind === 'replaceAll' && u.entityType === 'mix') {
            mixes = mixes.map((m) => (m.id === u.entityKey ? { ...m, crop_sheets: u.sheets } : m));
          }
        }
        return { ...r, mixes };
      });
    },
  };
}

beforeEach(() => {
  updateEq.mockClear();
  updateEq.mockResolvedValue({ error: null });
});

// ── currentCropsOfBatch (helper) ────────────────────────────────────────────

describe('currentCropsOfBatch', () => {
  it('returns deduplicated crops across all sheets of the batch', () => {
    const batch: RemixMix = {
      id: 'b1',
      order: 0,
      name: 'Batch 1',
      crop_sheets: [
        {
          title: 'sheet 1',
          sheet_geometry: { width: 100, height: 100 },
          image_url: '',
          swap_results: [],
          crops: [makeCropEntry('s1', 'i1', 'c1'), makeCropEntry('s2', 'i2', 'c1')],
        },
        {
          // Duplicate (s1/i1) on a second sheet — must collapse to ONE entry.
          title: 'sheet 2',
          sheet_geometry: { width: 100, height: 100 },
          image_url: '',
          swap_results: [],
          crops: [makeCropEntry('s1', 'i1', 'c1')],
        },
      ],
    };
    const out = currentCropsOfBatch(batch);
    expect(out.map((c) => `${c.spread_id}/${c.id}`)).toEqual(['s1/i1', 's2/i2']);
  });

  it('returns an empty array for a batch with no crops', () => {
    expect(currentCropsOfBatch(makeBatch('b1', 0, 'Batch 1', false, []))).toEqual([]);
  });
});

// ── addBatch (rev6 — subset signature) ─────────────────────────────────────

describe('addBatch (rev6 subset)', () => {
  it('appends a new batch packed from the SELECTED subset (K=1) + returns new id', async () => {
    const remix = makeRemix([makeBatch('b1', 0, 'Batch 1')]);
    const deps = makeDeps(remix);

    // Pick only the s1/i1 crop — the new batch must contain ONLY that crop.
    const selection = new Set<string>(['s1/i1']);
    const newId = await addBatch(deps, 'remix-1', 'b1', selection);

    expect(newId).not.toBeNull();
    expect(typeof newId).toBe('string');
    expect(newId).not.toBe('b1');

    const mixes = deps.state.remixes[0].mixes;
    expect(mixes).toHaveLength(2);
    const added = mixes[1];
    expect(added.id).toBe(newId);
    expect(added.order).toBe(1);
    expect(added.crop_sheets).toHaveLength(1);
    // Subset filter actually narrowed the lineup.
    const addedKeys = added.crop_sheets[0].crops.map(
      (c) => `${c.spread_id}/${c.id}`,
    );
    expect(addedKeys).toEqual(['s1/i1']);
    expect(updateEq).toHaveBeenCalledTimes(1);
  });

  it('throws on empty selection (no UI bug should ever call this with empty)', async () => {
    const remix = makeRemix([makeBatch('b1', 0, 'Batch 1')]);
    const deps = makeDeps(remix);

    await expect(addBatch(deps, 'remix-1', 'b1', new Set())).rejects.toThrow(
      /non-empty/i,
    );
    // No optimistic push, no persist.
    expect(deps.state.remixes[0].mixes).toHaveLength(1);
    expect(updateEq).not.toHaveBeenCalled();
  });

  it('throws when selection has zero matches against the active batch (stale keys)', async () => {
    const remix = makeRemix([makeBatch('b1', 0, 'Batch 1')]);
    const deps = makeDeps(remix);

    const stale = new Set<string>(['s9/i9', 's8/i8']);
    await expect(addBatch(deps, 'remix-1', 'b1', stale)).rejects.toThrow(
      /stale|match/i,
    );
    expect(deps.state.remixes[0].mixes).toHaveLength(1);
    expect(updateEq).not.toHaveBeenCalled();
  });

  it('returns null and rolls back when persist fails', async () => {
    updateEq.mockResolvedValueOnce({ error: { message: 'db down' } });
    const remix = makeRemix([makeBatch('b1', 0, 'Batch 1')]);
    const deps = makeDeps(remix);

    const newId = await addBatch(
      deps,
      'remix-1',
      'b1',
      new Set<string>(['s1/i1']),
    );
    expect(newId).toBeNull();
    // Rolled back to the single original batch.
    expect(deps.state.remixes[0].mixes.map((m) => m.id)).toEqual(['b1']);
  });

  it('returns null when the remix is missing', async () => {
    const remix = makeRemix([makeBatch('b1', 0, 'Batch 1')]);
    const deps = makeDeps(remix);
    const newId = await addBatch(
      deps,
      'unknown-remix',
      'b1',
      new Set<string>(['s1/i1']),
    );
    expect(newId).toBeNull();
    expect(updateEq).not.toHaveBeenCalled();
  });
});

// ── removeBatch ───────────────────────────────────────────────────────────────

describe('removeBatch', () => {
  it('removes a batch by id + persists', async () => {
    const remix = makeRemix([makeBatch('b1', 0, 'Batch 1'), makeBatch('b2', 1, 'Batch 2')]);
    const deps = makeDeps(remix);

    const ok = await removeBatch(deps, 'remix-1', 'b1');
    expect(ok).toBe(true);
    expect(deps.state.remixes[0].mixes.map((m) => m.id)).toEqual(['b2']);
  });

  it('refuses to remove the last batch (BATCH_MIN guard)', async () => {
    const remix = makeRemix([makeBatch('b1', 0, 'Batch 1')]);
    const deps = makeDeps(remix);

    const ok = await removeBatch(deps, 'remix-1', 'b1');
    expect(ok).toBe(false);
    expect(deps.state.remixes[0].mixes.map((m) => m.id)).toEqual(['b1']);
    expect(updateEq).not.toHaveBeenCalled();
  });
});

// ── relayoutBatchSheets ───────────────────────────────────────────────────────

describe('relayoutBatchSheets', () => {
  it('changes K (delta) and clears swap_results on every rebuilt sheet', async () => {
    const remix = makeRemix([makeBatch('b1', 0, 'Batch 1', /* withSwap */ true)]);
    const deps = makeDeps(remix);
    expect(remix.mixes[0].crop_sheets[0].swap_results).toHaveLength(1); // precondition

    const ok = await relayoutBatchSheets(deps, 'remix-1', 'b1', +1); // K: 1 → 2
    expect(ok).toBe(true);

    const sheets = deps.state.remixes[0].mixes[0].crop_sheets;
    expect(sheets).toHaveLength(2);
    // DESTRUCTIVE: every rebuilt sheet has swap_results cleared.
    for (const s of sheets) expect(s.swap_results).toEqual([]);
    expect(updateEq).toHaveBeenCalledTimes(1);
  });

  it('no-ops (returns false, no persist) when the count would not change at the clamp', async () => {
    // Already at SHEET_MIN=1; delta=-1 clamps back to 1 → no change.
    const remix = makeRemix([makeBatch('b1', 0, 'Batch 1')]);
    const deps = makeDeps(remix);

    const ok = await relayoutBatchSheets(deps, 'remix-1', 'b1', -1);
    expect(ok).toBe(false);
    expect(updateEq).not.toHaveBeenCalled();
  });

  it('returns false for an unknown batch', async () => {
    const remix = makeRemix([makeBatch('b1', 0, 'Batch 1')]);
    const deps = makeDeps(remix);
    expect(await relayoutBatchSheets(deps, 'remix-1', 'nope', +1)).toBe(false);
  });

  it('rev6: uses PER-BATCH scope (subset) instead of full illustration', async () => {
    // batch carries ONLY the s1/i1 crop (subset of the illustration which has
    // s1/i1 + s2/i2). After relayout the rebuilt sheets must still carry that
    // subset only — not pull in the missing s2/i2 from the full grouping.
    const subsetBatch = makeBatch('b1', 0, 'Batch 1', false, [
      { spreadId: 's1', layerId: 'i1', objectKey: 'c1' },
    ]);
    const remix = makeRemix([subsetBatch]);
    const deps = makeDeps(remix);

    const ok = await relayoutBatchSheets(deps, 'remix-1', 'b1', +1); // K: 1 → 2
    expect(ok).toBe(true);

    const sheets = deps.state.remixes[0].mixes[0].crop_sheets;
    // Union of crop ids across the rebuilt sheets — must be the subset {i1}.
    const ids = new Set<string>();
    for (const s of sheets) for (const c of s.crops) ids.add(`${c.spread_id}/${c.id}`);
    expect([...ids].sort()).toEqual(['s1/i1']);
  });
});

// ── deriveBatchSwapTask ───────────────────────────────────────────────────────

function job(over: Partial<RemixJob>): RemixJob {
  return {
    id: 'j1',
    remixId: 'remix-1',
    phase: 'remix_mix_swap',
    batchId: 'b1',
    triggeredBy: 'user',
    status: 'queued',
    currentStep: 0,
    totalSteps: 3,
    createdAt: '2026-05-27T00:00:00.000Z',
    updatedAt: '2026-05-27T00:00:00.000Z',
    ...over,
  } as RemixJob;
}

describe('deriveBatchSwapTask', () => {
  it('idle when no matching remix_mix_swap job for (remix, batch)', () => {
    expect(deriveBatchSwapTask([], 'remix-1', 'b1')).toEqual({ state: 'idle' });
    // A job for a DIFFERENT batch does not count.
    expect(deriveBatchSwapTask([job({ batchId: 'other' })], 'remix-1', 'b1')).toEqual({
      state: 'idle',
    });
  });

  it('running with current/total while queued or running', () => {
    expect(deriveBatchSwapTask([job({ status: 'running', currentStep: 2, totalSteps: 5 })], 'remix-1', 'b1')).toEqual({
      state: 'running',
      current: 2,
      total: 5,
    });
  });

  it('error for failed/cancelled jobs (failedSheets from result)', () => {
    const t = deriveBatchSwapTask(
      [job({ status: 'failed', result: { failed_sheets: 2, errors: [{ message: 'boom' }] } as RemixJob['result'] })],
      'remix-1',
      'b1',
    );
    expect(t.state).toBe('error');
    if (t.state === 'error') {
      expect(t.message).toBe('boom');
      expect(t.failedSheets).toBe(2);
    }
  });

  it('idle for a clean completed job; error for a completed job with errors', () => {
    expect(deriveBatchSwapTask([job({ status: 'completed', result: { errors: [] } as RemixJob['result'] })], 'remix-1', 'b1')).toEqual({
      state: 'idle',
    });
    const partial = deriveBatchSwapTask(
      [job({ status: 'completed', result: { errors: [{ message: 'one sheet failed' }] } as RemixJob['result'] })],
      'remix-1',
      'b1',
    );
    expect(partial.state).toBe('error');
  });

  it('picks the LATEST job by createdAt', () => {
    const older = job({ id: 'old', status: 'failed', createdAt: '2026-05-27T00:00:00.000Z', result: { errors: [{ message: 'x' }] } as RemixJob['result'] });
    const newer = job({ id: 'new', status: 'running', currentStep: 1, totalSteps: 4, createdAt: '2026-05-27T01:00:00.000Z' });
    expect(deriveBatchSwapTask([older, newer], 'remix-1', 'b1')).toEqual({
      state: 'running',
      current: 1,
      total: 4,
    });
  });
});
