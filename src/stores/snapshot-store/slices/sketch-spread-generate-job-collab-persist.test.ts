// Collab persist path of the sketch spread generate job (phase-03 fix): a page-image node is
// minted CLIENT-SIDE (crypto.randomUUID) and has never existed in the DB, so its FIRST gateway
// save must be a nested CREATE (action 2 + parent_id=<spreadId> + collection='images'). A node
// already known to the DB is UPLOADed (action 5); an UPLOAD that 404s (book corrupted by the
// pre-fix UPLOAD-only path) retries EXACTLY ONCE as the CREATE form.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createSketchSlice } from './sketch-slice';
import { createSketchSpreadGenerateJobSlice } from './sketch-spread-generate-job-slice';
import type { SketchSpread, SketchPage, SketchPageType, ArtDirection } from '@/types/sketch';
import { callGenerateSketchSpread, type SketchGeneratePage } from '@/apis/sketch-spread-api';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/apis/sketch-spread-api', () => ({ callGenerateSketchSpread: vi.fn() }));
vi.mock('@/apis/activity-log-client', () => ({
  insertGenerateSummaryLog: vi.fn(async () => {}),
  ACTION_TYPE_UPLOAD: 5,
  TARGET_TYPE_SPREAD: 1,
}));

// Mocked resource-lock store (the real module would close the slice ↔ store cycle). collabPersist
// is TRUE here → runJob takes the gateway path under test.
type MockTarget = { step: number; resource_type: number; resource_id: string };
type MockPayload = Record<string, unknown>;
type MockSaveResult = { ok: boolean; lost?: boolean; forbidden?: boolean; notFound?: boolean };

const acquire = vi.fn<(t: MockTarget) => Promise<{ ok: boolean; holder?: string }>>(async () => ({ ok: true }));
const release = vi.fn<(t: MockTarget) => Promise<void>>(async () => {});
const save = vi.fn<(t: MockTarget, p: MockPayload) => Promise<MockSaveResult>>(async () => ({ ok: true }));
vi.mock('@/stores/resource-lock-store', () => ({
  useResourceLockStore: {
    getState: () => ({
      collabPersist: true,
      myUserId: 'user-1',
      holderNames: new Map(),
      acquire,
      release,
      save,
    }),
  },
  ACTION_TYPE_CREATE: 2,
}));

const ACTION_CREATE = 2;
const ACTION_UPLOAD = 5;

/* eslint-disable @typescript-eslint/no-explicit-any */
function createTestStore() {
  const flushSnapshot = vi.fn(async () => {});
  return create<any>()(
    immer((...a: any[]) => ({
      ...(createSketchSlice as any)(...a),
      ...(createSketchSpreadGenerateJobSlice as any)(...a),
      sync: { isDirty: false, isSaving: false },
      meta: { id: 'snap-1', bookId: 'book-1' },
      flushSnapshot,
    })),
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const page = (type: SketchPageType): SketchPage => ({ type, art_direction: {} as ArtDirection });
const spread = (id: string): SketchSpread => ({ id, images: [], pages: [page('full')], textboxes: [] });

const ok = (url: string, p: SketchGeneratePage = 'full') => ({
  success: true as const,
  data: {
    imageUrl: url,
    storagePath: `path/${url}`,
    page: p,
    targetRatio: '2:1',
    genAspectRatio: '2:1',
    trimAxis: null as 'width' | 'height' | null,
    trimFraction: 0,
  },
});

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('SketchSpreadGenerateJobSlice — collab persist grain', () => {
  const mockedCall = vi.mocked(callGenerateSketchSpread);
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    mockedCall.mockReset();
    // mockReset (not mockClear): a queued-but-unconsumed mockResolvedValueOnce would otherwise
    // leak into the next case. Re-assert the defaults after the reset.
    acquire.mockReset();
    acquire.mockResolvedValue({ ok: true });
    release.mockReset();
    release.mockResolvedValue(undefined);
    save.mockReset();
    save.mockResolvedValue({ ok: true });
    store = createTestStore();
  });

  const start = (spreadIds: string[]) =>
    store.getState().startSketchSpreadGenerateJob({ spreadIds });

  it('first generate of a page → nested CREATE (action 2 + parent_id + collection)', async () => {
    store.getState().setSketchSpreads([spread('sp-1')]);
    mockedCall.mockResolvedValue(ok('a.png') as never);

    start(['sp-1']);
    await tick();
    await tick();

    expect(save).toHaveBeenCalledTimes(1);
    const [target, payload] = save.mock.calls[0];
    const imageId = store.getState().sketch.spreads[0].images[0].id;
    expect(target).toMatchObject({ step: 1, resource_type: 1, resource_id: imageId });
    expect(payload.action_type).toBe(ACTION_CREATE);
    expect(payload.parent_id).toBe('sp-1');
    expect(payload.collection).toBe('images');
    expect(payload.log).toBe(false);
    expect(store.getState().sketchSpreadGenerateJob.tasks[0].status).toBe('completed');
  });

  it('regenerate of an already-persisted page → UPLOAD (no parent_id/collection)', async () => {
    store.getState().setSketchSpreads([spread('sp-1')]);
    mockedCall.mockResolvedValue(ok('a.png') as never);

    start(['sp-1']); // 1st job → CREATE
    await tick();
    await tick();
    expect(save.mock.calls[0][1]).toMatchObject({ action_type: ACTION_CREATE });

    mockedCall.mockResolvedValue(ok('a2.png') as never);
    start(['sp-1']); // 2nd job on the SAME (now persisted) node → UPLOAD
    await tick();
    await tick();

    expect(save).toHaveBeenCalledTimes(2);
    const payload = save.mock.calls[1][1];
    expect(payload.action_type).toBe(ACTION_UPLOAD);
    expect(payload.parent_id).toBeUndefined();
    expect(payload.collection).toBeUndefined();
  });

  it('UPLOAD → 404 not-found retries EXACTLY once as nested CREATE', async () => {
    // Image node already in the loaded snapshot (pre-existing → UPLOAD first) but absent in the DB
    // (corrupted by the pre-fix path) → the gateway answers 404.
    const withImage: SketchSpread = {
      ...spread('sp-1'),
      images: [{ id: 'img-1', type: 'full', illustrations: [] }],
    };
    store.getState().setSketchSpreads([withImage]);
    mockedCall.mockResolvedValue(ok('a.png') as never);
    save
      .mockResolvedValueOnce({ ok: false, lost: true, forbidden: false, notFound: true })
      .mockResolvedValueOnce({ ok: true });

    start(['sp-1']);
    await tick();
    await tick();

    expect(save).toHaveBeenCalledTimes(2); // exactly ONE retry
    expect(save.mock.calls[0][1]).toMatchObject({ action_type: ACTION_UPLOAD });
    expect(save.mock.calls[1][1]).toMatchObject({
      action_type: ACTION_CREATE,
      parent_id: 'sp-1',
      collection: 'images',
    });
    expect(store.getState().sketchSpreadGenerateJob.tasks[0].status).toBe('completed');
  });

  it('a failed CREATE is NOT retried (the fallback is UPLOAD-only)', async () => {
    store.getState().setSketchSpreads([spread('sp-1')]);
    mockedCall.mockResolvedValue(ok('a.png') as never);
    save.mockResolvedValue({ ok: false, lost: true, forbidden: false, notFound: true });

    start(['sp-1']);
    await tick();
    await tick();

    expect(save).toHaveBeenCalledTimes(1); // CREATE → 404 → no CREATE-after-CREATE loop
    expect(save.mock.calls[0][1]).toMatchObject({ action_type: ACTION_CREATE });
    expect(store.getState().sketchSpreadGenerateJob.tasks[0].status).toBe('error');
  });

  it('a CREATE whose response was never seen is not re-CREATEd (attempt marker)', async () => {
    store.getState().setSketchSpreads([spread('sp-1')]);
    mockedCall.mockResolvedValue(ok('a.png') as never);
    // 1st job: the CREATE "fails" from the client's point of view (e.g. dropped response) — the
    // node may nonetheless exist server-side, so a re-generate must NOT issue a second CREATE.
    save.mockResolvedValueOnce({ ok: false, lost: false, forbidden: false, notFound: false });

    start(['sp-1']);
    await tick();
    await tick();
    expect(save.mock.calls[0][1]).toMatchObject({ action_type: ACTION_CREATE });

    save.mockResolvedValue({ ok: true });
    start(['sp-1']); // same session, same node id
    await tick();
    await tick();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][1]).toMatchObject({ action_type: ACTION_UPLOAD });
  });

  it('both the UPLOAD and its CREATE fallback fail → task marked error (never swallowed)', async () => {
    const withImage: SketchSpread = {
      ...spread('sp-1'),
      images: [{ id: 'img-1', type: 'full', illustrations: [] }],
    };
    store.getState().setSketchSpreads([withImage]);
    mockedCall.mockResolvedValue(ok('a.png') as never);
    save.mockResolvedValue({ ok: false, lost: true, forbidden: false, notFound: true });

    start(['sp-1']);
    await tick();
    await tick();

    expect(save).toHaveBeenCalledTimes(2);
    const task = store.getState().sketchSpreadGenerateJob.tasks[0];
    expect(task.status).toBe('error');
    expect(task.error?.message).toMatch(/could not be saved/i);
  });

  it('FIRST generate whose new page-image lock is 409-blocked → error, never a green skip', async () => {
    // No pre-existing image → the lock can only be acquired AFTER the node is minted; a peer
    // holding it means the generated image is store-only and vanishes on reload.
    store.getState().setSketchSpreads([spread('sp-1')]);
    mockedCall.mockResolvedValue(ok('a.png') as never);
    // Target-aware: the Phase-0 SPREAD lock (type 6) succeeds; only the PAGE-image (type 1)
    // deferred acquire is blocked — the scenario under test. beforeEach resets to always-ok.
    acquire.mockImplementation(async (t) =>
      t.resource_type === 1 ? { ok: false, holder: 'peer-1' } : { ok: true },
    );

    start(['sp-1']);
    await tick();
    await tick();

    expect(save).not.toHaveBeenCalled();
    const task = store.getState().sketchSpreadGenerateJob.tasks[0];
    expect(task.status).toBe('error');
    expect(task.error?.message).toMatch(/another editor/i);
    expect(store.getState().sketchSpreadGenerateJob.skipped).toBe(0); // a failure, not a skip
  });

  it('spread lock (type 6) held by another → spread SKIPPED before any AI call', async () => {
    store.getState().setSketchSpreads([spread('sp-1')]);
    mockedCall.mockResolvedValue(ok('a.png') as never);
    acquire.mockImplementation(async (t) =>
      t.resource_type === 6 ? { ok: false, holder: 'peer-1' } : { ok: true },
    );

    start(['sp-1']);
    await tick();
    await tick();

    expect(mockedCall).not.toHaveBeenCalled(); // blocked BEFORE generating — no wasted AI call
    expect(save).not.toHaveBeenCalled();
    const job = store.getState().sketchSpreadGenerateJob;
    expect(job.tasks[0].status).toBe('error');
    expect(job.tasks[0].skipped).toBe(true);
    expect(job.tasks[0].error?.message).toMatch(/another editor/i);
    expect(job.skipped).toBe(1);
    expect(job.skippedNames).toEqual(['spread #1']);
    expect(job.status).toBe('completed');
  });

  it('acquires the spread lock (type 6) FIRST and releases it at spread end', async () => {
    store.getState().setSketchSpreads([spread('sp-1')]);
    mockedCall.mockResolvedValue(ok('a.png') as never);

    start(['sp-1']);
    await tick();
    await tick();

    expect(acquire.mock.calls[0][0]).toMatchObject({ step: 1, resource_type: 6, resource_id: 'sp-1' });
    expect(release.mock.calls.map((c) => c[0])).toContainEqual(
      expect.objectContaining({ resource_type: 6, resource_id: 'sp-1' }),
    );
    expect(store.getState().sketchSpreadGenerateJob.tasks[0].status).toBe('completed');
  });

  it('a spread-lock-blocked spread is skipped and the job CONTINUES to the next spread', async () => {
    store.getState().setSketchSpreads([spread('sp-1'), spread('sp-2')]);
    mockedCall.mockResolvedValue(ok('b.png') as never);
    acquire.mockImplementation(async (t) =>
      t.resource_type === 6 && t.resource_id === 'sp-1' ? { ok: false, holder: 'peer-1' } : { ok: true },
    );

    start(['sp-1', 'sp-2']);
    await tick();
    await tick();
    await tick();

    expect(mockedCall).toHaveBeenCalledTimes(1); // only sp-2 generated
    expect(mockedCall.mock.calls[0][0]).toMatchObject({ sketchSpreadId: 'sp-2' });
    const job = store.getState().sketchSpreadGenerateJob;
    expect(job.tasks[0].skipped).toBe(true);
    expect(job.tasks[1].status).toBe('completed');
    expect(job.skipped).toBe(1);
    expect(job.status).toBe('completed');
  });
});
