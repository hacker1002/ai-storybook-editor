import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SnapshotStore } from '../types';

// Isolate the resource-lock store (same seam as collab-image-save-helper.test.ts): the helper is
// imported DIRECTLY (bypassing snapshot-store/index) so the real store would close the slice ↔ store
// cycle. The fake exposes only acquire/save/release + collabPersist/bookId (isCollab gate) and the
// registry/holderNames the real `resolveLockHolderName` reads on a 'skipped' outcome.
const h = vi.hoisted(() => {
  const acquire = vi.fn();
  const save = vi.fn();
  const release = vi.fn();
  const state = {
    acquire,
    save,
    release,
    collabPersist: true,
    bookId: 'book-1' as string | null,
    registry: new Map<string, { holder_user_id: string }>(),
    holderNames: new Map<string, string>(),
  };
  return { acquire, save, release, state };
});

vi.mock('@/stores/resource-lock-store', () => ({
  useResourceLockStore: { getState: () => h.state },
  keyOf: (bookId: string, t: { step: number; resource_type: number; resource_id: string; locale: string | null }) =>
    `${bookId}|${t.step}|${t.resource_type}|${t.resource_id}|${t.locale ?? ''}`,
  FALLBACK_HOLDER_NAME: 'another editor',
}));

// Toast UX is the caller's job (reportSaveOutcome) — spy on the shared wording helpers.
const toasts = vi.hoisted(() => ({
  toastLockedByOther: vi.fn(),
  toastForbiddenIllustration: vi.fn(),
}));
vi.mock('@/utils/collab-save-toasts', () => toasts);

import { persistAnimationsCollectionCollab } from './collab-retouch-save-helper';

const SPREAD_ID = 'sp1';
const ANIMATIONS = [
  { type: 'fade', target: { id: 't1' } },
  { type: 'slide', target: { id: 't2' } },
];

/** Minimal fresh snapshot `get()` — only the `illustration.spreads` seam the helper reads. */
function makeGet(spreads: unknown[]): () => SnapshotStore {
  return () => ({ illustration: { spreads } }) as unknown as SnapshotStore;
}

const getWithAnimations = makeGet([{ id: SPREAD_ID, animations: ANIMATIONS }]);

describe('persistAnimationsCollectionCollab', () => {
  beforeEach(() => {
    h.acquire.mockReset();
    h.save.mockReset();
    h.release.mockReset();
    h.release.mockResolvedValue(undefined);
    h.state.registry.clear();
    h.state.holderNames.clear();
    h.state.collabPersist = true;
    h.state.bookId = 'book-1';
    toasts.toastLockedByOther.mockReset();
    toasts.toastForbiddenIllustration.mockReset();
  });

  it('collab OFF (collabPersist=false) → solo no-op: no acquire/save/release', async () => {
    h.state.collabPersist = false;

    await persistAnimationsCollectionCollab(getWithAnimations, SPREAD_ID);

    expect(h.acquire).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it('no bookId → bails before acquire (no spurious lock toast)', async () => {
    h.state.bookId = null;

    await persistAnimationsCollectionCollab(getWithAnimations, SPREAD_ID);

    expect(h.acquire).not.toHaveBeenCalled();
    expect(toasts.toastLockedByOther).not.toHaveBeenCalled();
  });

  it('happy path: saves the WHOLE animations array under a rtype-9 spread lock, then releases', async () => {
    h.acquire.mockResolvedValue({ ok: true });
    h.save.mockResolvedValue({ ok: true });

    await persistAnimationsCollectionCollab(getWithAnimations, SPREAD_ID);

    // rtype-9 lock keyed by the OWNING spread (resource_id = parent_id = spreadId).
    const expectedTarget = { step: 2, resource_type: 9, resource_id: SPREAD_ID, locale: null };
    expect(h.acquire).toHaveBeenCalledWith(expectedTarget);

    expect(h.save).toHaveBeenCalledTimes(1);
    const [savedTarget, payload] = h.save.mock.calls[0];
    expect(savedTarget).toEqual(expectedTarget);
    // Regression guard: collection set + patch is a LIST → backend whole-array-replace mode.
    expect(payload).toMatchObject({
      action_type: 3,
      patch: ANIMATIONS,
      parent_id: SPREAD_ID,
      collection: 'animations',
      log: true,
      target_ref: { spread_id: SPREAD_ID, collection: 'animations' },
    });
    expect(Array.isArray(payload.patch)).toBe(true);

    expect(h.release).toHaveBeenCalledWith(expectedTarget);
    expect(toasts.toastLockedByOther).not.toHaveBeenCalled();
    expect(toasts.toastForbiddenIllustration).not.toHaveBeenCalled();
  });

  it('acquire 409 (skipped) → toastLockedByOther, NO save, NO release', async () => {
    h.acquire.mockResolvedValue({ ok: false, code: 'LOCK_HELD', holder: 'u2' });

    await persistAnimationsCollectionCollab(getWithAnimations, SPREAD_ID);

    expect(h.save).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled(); // no lock held → nothing to release
    expect(toasts.toastLockedByOther).toHaveBeenCalledTimes(1);
    expect(toasts.toastForbiddenIllustration).not.toHaveBeenCalled();
  });

  it('forbidden (save 403) → toastForbiddenIllustration, still releases', async () => {
    h.acquire.mockResolvedValue({ ok: true });
    h.save.mockResolvedValue({ ok: false, lost: false, forbidden: true });

    await persistAnimationsCollectionCollab(getWithAnimations, SPREAD_ID);

    expect(toasts.toastForbiddenIllustration).toHaveBeenCalledTimes(1);
    expect(toasts.toastLockedByOther).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledWith({ step: 2, resource_type: 9, resource_id: SPREAD_ID, locale: null });
  });
});
