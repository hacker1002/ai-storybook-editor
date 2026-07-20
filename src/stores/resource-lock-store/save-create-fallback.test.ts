import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useResourceLockStore } from './index';
import type { LockTarget, SavePayload } from './types';
import { saveResource, releaseResourceLock } from '@/apis/resource-lock-api';

// saveWithCreateFallback is module-private, so it is exercised through its ONLY two entry points
// (`save` / `releaseAndSave`) — the same seam the sketch spread canvas and the generate job use.
// The api client is mocked so we can script the 404-then-create recovery without a server.

vi.mock('@/apis/resource-lock-api', () => ({
  saveResource: vi.fn(),
  acquireResourceLock: vi.fn(),
  renewResourceLock: vi.fn(),
  releaseResourceLock: vi.fn(async () => undefined),
}));

const BOOK = 'book1';
const TARGET: LockTarget = { step: 1, resource_type: 1, resource_id: 'img1', locale: null };

/** Canvas Edit/Extract payload: an EDIT on a node that may not exist in the DB yet. */
const EDIT_PAYLOAD: SavePayload = {
  action_type: 3,
  patch: { id: 'img1', type: 'left' },
  target_ref: { spread_number: 2, page: 'left' },
  create_fallback: { parent_id: 'spread1', collection: 'images' },
};

const OK = { ok: true as const, snapshot_id: 'snap1', updated_at: 'now' };
const NOT_FOUND = { ok: false as const, lost: true, forbidden: false, notFound: true };
const CONFLICT = { ok: false as const, lost: true, forbidden: false, notFound: false };

const mockSave = vi.mocked(saveResource);
const mockRelease = vi.mocked(releaseResourceLock);

/** Payload of the n-th (0-based) saveResource call. */
function payloadOf(n: number): SavePayload {
  return mockSave.mock.calls[n][2];
}

beforeEach(() => {
  vi.clearAllMocks();
  useResourceLockStore.setState({ bookId: BOOK, myUserId: 'me', myLocks: new Set() });
});

describe('save() → saveWithCreateFallback', () => {
  it('first write succeeds → single call, no retry', async () => {
    mockSave.mockResolvedValueOnce(OK);
    const res = await useResourceLockStore.getState().save(TARGET, EDIT_PAYLOAD);
    expect(res).toEqual({ ok: true });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(payloadOf(0).action_type).toBe(3);
  });

  it('404 → nested CREATE (unaudited) then re-issues the ORIGINAL edit for the audit row', async () => {
    mockSave
      .mockResolvedValueOnce(NOT_FOUND) // edit — node absent in the DB
      .mockResolvedValueOnce(OK) // repair create
      .mockResolvedValueOnce(OK); // re-issued edit (audit)
    const res = await useResourceLockStore.getState().save(TARGET, EDIT_PAYLOAD);

    expect(res).toEqual({ ok: true });
    expect(mockSave).toHaveBeenCalledTimes(3);
    // The repair create carries the nested-create addressing and is NOT audited…
    expect(payloadOf(1)).toMatchObject({
      action_type: 2,
      parent_id: 'spread1',
      collection: 'images',
      log: false,
    });
    // …so the only activity row comes from the re-issued EDIT (never "created").
    expect(payloadOf(2)).toMatchObject({ action_type: 3, target_ref: { page: 'left' } });
    expect(payloadOf(2).log).toBeUndefined();
    expect(payloadOf(2).parent_id).toBeUndefined();
  });

  it('404 without create_fallback → surfaced as notFound, no retry', async () => {
    mockSave.mockResolvedValueOnce(NOT_FOUND);
    const { create_fallback: _omit, ...noFallback } = EDIT_PAYLOAD;
    const res = await useResourceLockStore.getState().save(TARGET, noFallback);

    expect(res).toMatchObject({ ok: false, lost: true, notFound: true });
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('409 (lock lost) never triggers the create fallback', async () => {
    mockSave.mockResolvedValueOnce(CONFLICT);
    const res = await useResourceLockStore.getState().save(TARGET, EDIT_PAYLOAD);

    expect(res).toMatchObject({ ok: false, lost: true });
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('caller already opted out of the audit (log:false — generate job) → no re-issue', async () => {
    mockSave.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce(OK);
    const res = await useResourceLockStore
      .getState()
      .save(TARGET, { ...EDIT_PAYLOAD, action_type: 5, log: false });

    expect(res).toEqual({ ok: true });
    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(payloadOf(1).action_type).toBe(2);
  });

  it('an explicit CREATE is never retried as a create', async () => {
    mockSave.mockResolvedValueOnce(NOT_FOUND);
    const res = await useResourceLockStore
      .getState()
      .save(TARGET, { ...EDIT_PAYLOAD, action_type: 2 });

    expect(res).toMatchObject({ ok: false, notFound: true });
    expect(mockSave).toHaveBeenCalledTimes(1);
  });

  it('repair create fails → failure reported, no audit re-issue', async () => {
    mockSave.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce(CONFLICT);
    const res = await useResourceLockStore.getState().save(TARGET, EDIT_PAYLOAD);

    expect(res).toMatchObject({ ok: false, lost: true });
    expect(mockSave).toHaveBeenCalledTimes(2);
  });

  it('audit re-issue fails → still ok (the data landed with the create)', async () => {
    mockSave
      .mockResolvedValueOnce(NOT_FOUND)
      .mockResolvedValueOnce(OK)
      .mockResolvedValueOnce(CONFLICT);
    const res = await useResourceLockStore.getState().save(TARGET, EDIT_PAYLOAD);

    expect(res).toEqual({ ok: true });
    expect(mockSave).toHaveBeenCalledTimes(3);
  });
});

describe('releaseAndSave() → saveWithCreateFallback', () => {
  it('recovers a 404 the same way, then releases the lock', async () => {
    mockSave.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce(OK).mockResolvedValueOnce(OK);
    await useResourceLockStore.getState().releaseAndSave(TARGET, true, EDIT_PAYLOAD);

    expect(mockSave).toHaveBeenCalledTimes(3);
    expect(payloadOf(1)).toMatchObject({ action_type: 2, collection: 'images', log: false });
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('unrecoverable 404 (create also fails) keeps local changes and skips the unlock', async () => {
    mockSave.mockResolvedValueOnce(NOT_FOUND).mockResolvedValueOnce(NOT_FOUND);
    await useResourceLockStore.getState().releaseAndSave(TARGET, true, EDIT_PAYLOAD);

    expect(mockSave).toHaveBeenCalledTimes(2);
    expect(mockRelease).not.toHaveBeenCalled(); // `lost` → unlock is a no-op, bookkeeping only
  });
});
