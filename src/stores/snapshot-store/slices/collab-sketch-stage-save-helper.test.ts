import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveSketchStageLockTarget,
  buildSketchStagePayload,
  flushSketchStageUnderLock,
} from './collab-sketch-stage-save-helper';

// Mutable lock-store state so each test drives collabPersist / myLocks / acquire·save outcomes.
const h = vi.hoisted(() => {
  const state = {
    collabPersist: false as boolean,
    bookId: 'book-1' as string | null,
    myLocks: new Set<string>(),
    acquire: vi.fn(async (_t: unknown) => ({ ok: true }) as { ok: boolean; holder?: string }),
    save: vi.fn(async (_t: unknown, _p: unknown) => ({ ok: true }) as { ok: boolean; lost?: boolean; forbidden?: boolean }),
    release: vi.fn(async (_t: unknown) => {}),
  };
  return { state };
});

vi.mock('@/stores/resource-lock-store', () => ({
  useResourceLockStore: { getState: () => h.state },
  keyOf: (bookId: string, t: { step: number; resource_type: number; resource_id: string; locale: string | null }) =>
    `${bookId}|${t.step}|${t.resource_type}|${t.resource_id}|${t.locale ?? ''}`,
}));
vi.mock('@/utils/collab-save-toasts', () => ({ toastLockedByOther: vi.fn() }));
vi.mock('./collab-image-save-helper', () => ({ resolveLockHolderName: () => 'Peer' }));

const NODE = { key: 'forest', base: { styles: [] }, variants: [{ key: 'base' }] };
const TARGET = { step: 1, resource_type: 5, resource_id: 'forest', locale: null };

beforeEach(() => {
  h.state.collabPersist = false;
  h.state.bookId = 'book-1';
  h.state.myLocks = new Set();
  h.state.acquire.mockReset().mockResolvedValue({ ok: true });
  h.state.save.mockReset().mockResolvedValue({ ok: true });
  h.state.release.mockReset().mockResolvedValue(undefined);
});

describe('resolveSketchStageLockTarget', () => {
  it('maps a stage → step 1 / rtype 5, whole-node target, null locale', () => {
    expect(resolveSketchStageLockTarget('forest')).toEqual(TARGET);
  });
});

describe('buildSketchStagePayload', () => {
  it('wraps the whole node as an edit (action_type 3) with log:true', () => {
    expect(buildSketchStagePayload(NODE)).toEqual({ action_type: 3, patch: NODE, log: true });
  });
});

describe('flushSketchStageUnderLock', () => {
  it('solo (collabPersist=false) → no-op true, never touches the gateway', async () => {
    const ok = await flushSketchStageUnderLock('forest', NODE);
    expect(ok).toBe(true);
    expect(h.state.acquire).not.toHaveBeenCalled();
    expect(h.state.save).not.toHaveBeenCalled();
  });

  it('collab + NOT already held → acquires then saves the whole node, KEEPS the lock', async () => {
    h.state.collabPersist = true;
    const ok = await flushSketchStageUnderLock('forest', NODE);
    expect(ok).toBe(true);
    expect(h.state.acquire).toHaveBeenCalledTimes(1);
    expect(h.state.save).toHaveBeenCalledWith(TARGET, { action_type: 3, patch: NODE, log: true });
    expect(h.state.release).not.toHaveBeenCalled(); // flush-before default keeps the lock
  });

  it('collab + already held (myLocks has the key) → skips acquire, saves, KEEPS the lock', async () => {
    h.state.collabPersist = true;
    h.state.myLocks = new Set(['book-1|1|5|forest|']);
    const ok = await flushSketchStageUnderLock('forest', NODE, { releaseIfAcquired: true });
    expect(ok).toBe(true);
    expect(h.state.acquire).not.toHaveBeenCalled();
    expect(h.state.save).toHaveBeenCalledTimes(1);
    expect(h.state.release).not.toHaveBeenCalled(); // held-session owns it → never release
  });

  it('releaseIfAcquired + NOT held → one-shot: acquires + saves + RELEASES (no lingering lock)', async () => {
    h.state.collabPersist = true;
    const ok = await flushSketchStageUnderLock('forest', NODE, { releaseIfAcquired: true });
    expect(ok).toBe(true);
    expect(h.state.acquire).toHaveBeenCalledTimes(1);
    expect(h.state.release).toHaveBeenCalledWith(TARGET);
  });

  it('releaseIfAcquired + save REJECTED after acquire → still releases (finally-block)', async () => {
    h.state.collabPersist = true;
    h.state.save.mockResolvedValueOnce({ ok: false, lost: true, forbidden: false });
    const ok = await flushSketchStageUnderLock('forest', NODE, { releaseIfAcquired: true });
    expect(ok).toBe(false);
    expect(h.state.release).toHaveBeenCalledTimes(1);
  });

  it('collab + acquire 409 (peer holds the stage) → false, no save (caller aborts)', async () => {
    h.state.collabPersist = true;
    h.state.acquire.mockResolvedValueOnce({ ok: false, holder: 'peer-id' });
    const ok = await flushSketchStageUnderLock('forest', NODE);
    expect(ok).toBe(false);
    expect(h.state.save).not.toHaveBeenCalled();
  });

  it('collab + save rejected → false', async () => {
    h.state.collabPersist = true;
    h.state.save.mockResolvedValueOnce({ ok: false, lost: true, forbidden: false });
    const ok = await flushSketchStageUnderLock('forest', NODE);
    expect(ok).toBe(false);
  });

  it('collab + null node → false (nothing to persist)', async () => {
    h.state.collabPersist = true;
    const ok = await flushSketchStageUnderLock('forest', null);
    expect(ok).toBe(false);
    expect(h.state.acquire).not.toHaveBeenCalled();
  });

  it('collab + no bookId → false (not connected)', async () => {
    h.state.collabPersist = true;
    h.state.bookId = null;
    const ok = await flushSketchStageUnderLock('forest', NODE);
    expect(ok).toBe(false);
    expect(h.state.acquire).not.toHaveBeenCalled();
  });
});
