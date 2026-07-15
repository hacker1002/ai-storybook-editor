import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SKETCH_KIND_TO_SHEET_RESOURCE_ID,
  resolveSketchBaseSheetLockTarget,
  buildSketchBaseSheetPayload,
  flushSketchBaseSheetUnderLock,
} from './collab-sketch-base-sheet-save-helper';

// Mutable lock-store state so each test drives collabPersist / myLocks / acquire·save outcomes.
// vi.hoisted → available inside the hoisted vi.mock factory.
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

// keyOf mirrors the real composite key so myLocks.has() checks resolve the same string.
vi.mock('@/stores/resource-lock-store', () => ({
  useResourceLockStore: { getState: () => h.state },
  keyOf: (bookId: string, t: { step: number; resource_type: number; resource_id: string; locale: string | null }) =>
    `${bookId}|${t.step}|${t.resource_type}|${t.resource_id}|${t.locale ?? ''}`,
}));
vi.mock('@/utils/collab-save-toasts', () => ({ toastLockedByOther: vi.fn() }));
vi.mock('./collab-image-save-helper', () => ({ resolveLockHolderName: () => 'Peer' }));

const SHEET_NODE = { styles: [{ style_prompt: 's', is_selected: true, image_references: [], illustrations: [], crops: [] }] };

beforeEach(() => {
  h.state.collabPersist = false;
  h.state.bookId = 'book-1';
  h.state.myLocks = new Set();
  h.state.acquire.mockReset().mockResolvedValue({ ok: true });
  h.state.save.mockReset().mockResolvedValue({ ok: true });
  h.state.release.mockReset().mockResolvedValue(undefined);
});

describe('resolveSketchBaseSheetLockTarget', () => {
  it('maps characters → step 1 / rtype 11 / resource_id character_sheet', () => {
    expect(resolveSketchBaseSheetLockTarget('characters')).toEqual({
      step: 1,
      resource_type: 11,
      resource_id: 'character_sheet',
      locale: null,
    });
  });
  it('maps props → step 1 / rtype 11 / resource_id prop_sheet', () => {
    expect(resolveSketchBaseSheetLockTarget('props')).toEqual({
      step: 1,
      resource_type: 11,
      resource_id: 'prop_sheet',
      locale: null,
    });
  });
  it('constant matches the resolver (characters → character_sheet · props → prop_sheet)', () => {
    expect(SKETCH_KIND_TO_SHEET_RESOURCE_ID).toEqual({ characters: 'character_sheet', props: 'prop_sheet' });
  });
});

describe('buildSketchBaseSheetPayload', () => {
  it('wraps the whole sheet node as an edit (action_type 3) with log:true', () => {
    expect(buildSketchBaseSheetPayload(SHEET_NODE)).toEqual({ action_type: 3, patch: SHEET_NODE, log: true });
  });
});

describe('flushSketchBaseSheetUnderLock', () => {
  it('solo (collabPersist=false) → no-op true, never touches the gateway', async () => {
    const ok = await flushSketchBaseSheetUnderLock('characters', SHEET_NODE);
    expect(ok).toBe(true);
    expect(h.state.acquire).not.toHaveBeenCalled();
    expect(h.state.save).not.toHaveBeenCalled();
  });

  it('collab + NOT already held → acquires then saves the whole sheet, KEEPS the lock (default)', async () => {
    h.state.collabPersist = true;
    const ok = await flushSketchBaseSheetUnderLock('characters', SHEET_NODE);
    expect(ok).toBe(true);
    expect(h.state.acquire).toHaveBeenCalledTimes(1);
    // save carries the whole-sheet edit payload for the step-1/rtype-11 target.
    expect(h.state.save).toHaveBeenCalledWith(
      { step: 1, resource_type: 11, resource_id: 'character_sheet', locale: null },
      { action_type: 3, patch: SHEET_NODE, log: true },
    );
    expect(h.state.release).not.toHaveBeenCalled(); // default keeps the lock for the held-session
  });

  it('collab + already held (myLocks has the key) → skips acquire, just saves, KEEPS the lock', async () => {
    h.state.collabPersist = true;
    h.state.myLocks = new Set(['book-1|1|11|prop_sheet|']);
    const ok = await flushSketchBaseSheetUnderLock('props', SHEET_NODE, { releaseIfAcquired: true });
    expect(ok).toBe(true);
    expect(h.state.acquire).not.toHaveBeenCalled();
    expect(h.state.save).toHaveBeenCalledTimes(1);
    expect(h.state.release).not.toHaveBeenCalled(); // held-session owns it → do NOT release
  });

  it('releaseIfAcquired + NOT held → one-shot: acquires + saves + RELEASES (no lingering lock)', async () => {
    h.state.collabPersist = true;
    const ok = await flushSketchBaseSheetUnderLock('characters', SHEET_NODE, { releaseIfAcquired: true });
    expect(ok).toBe(true);
    expect(h.state.acquire).toHaveBeenCalledTimes(1);
    expect(h.state.save).toHaveBeenCalledTimes(1);
    expect(h.state.release).toHaveBeenCalledWith({ step: 1, resource_type: 11, resource_id: 'character_sheet', locale: null });
  });

  it('releaseIfAcquired + save REJECTED after acquire → still releases (no leak on the error path)', async () => {
    h.state.collabPersist = true;
    h.state.save.mockResolvedValueOnce({ ok: false, lost: true, forbidden: false });
    const ok = await flushSketchBaseSheetUnderLock('characters', SHEET_NODE, { releaseIfAcquired: true });
    expect(ok).toBe(false);
    expect(h.state.release).toHaveBeenCalledTimes(1); // finally-block release even on reject
  });

  it('collab + acquire 409 (peer holds) → false, no save (caller aborts)', async () => {
    h.state.collabPersist = true;
    h.state.acquire.mockResolvedValueOnce({ ok: false, holder: 'peer-id' });
    const ok = await flushSketchBaseSheetUnderLock('characters', SHEET_NODE);
    expect(ok).toBe(false);
    expect(h.state.save).not.toHaveBeenCalled();
  });

  it('collab + save rejected → false', async () => {
    h.state.collabPersist = true;
    h.state.save.mockResolvedValueOnce({ ok: false, lost: true, forbidden: false });
    const ok = await flushSketchBaseSheetUnderLock('props', SHEET_NODE);
    expect(ok).toBe(false);
  });

  it('collab + null node → false (nothing to persist)', async () => {
    h.state.collabPersist = true;
    const ok = await flushSketchBaseSheetUnderLock('characters', null);
    expect(ok).toBe(false);
    expect(h.state.acquire).not.toHaveBeenCalled();
  });
});
