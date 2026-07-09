// retouch-edit-image-modal.test.tsx — collab per-resource save wiring (ADR-044, Track C).
// Renders the wrapper with a STUB EditImageModal that exposes `onUpdateIllustrations` via a button
// (the real modal routes BOTH commit and version-switch through this one prop). The REAL collab
// helper runs against a faked resource-lock store (acquire/save/release seams) so the test asserts
// the full handleUpdate → gateway-save wiring: collab-on target/action, collab-off no-op, 409 skip
// + toast, 403 forbidden toast (no crash).

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub the heavy EditImageModal → one button that fires onUpdateIllustrations (commit path).
vi.mock('@/features/editor/components/shared-components/edit-image-modal', () => ({
  EditImageModal: ({ onUpdateIllustrations }: { onUpdateIllustrations: (n: unknown[]) => void }) => (
    <button onClick={() => onUpdateIllustrations([{ media_url: 'v2.png', is_selected: true }])}>commit</button>
  ),
}));

// Faked resource-lock store (toggleable collabPersist + acquire/save/release). The REAL helper +
// resolveLockHolderName run against this (same pattern as collab-image-save-helper.test.ts).
const h = vi.hoisted(() => {
  const acquire = vi.fn();
  const save = vi.fn();
  const release = vi.fn();
  const state = {
    collabPersist: false,
    acquire,
    save,
    release,
    bookId: 'book-1',
    registry: new Map<string, { holder_user_id: string }>(),
    holderNames: new Map<string, string>(),
  };
  return { acquire, save, release, state };
});
vi.mock('@/stores/resource-lock-store', () => ({
  useResourceLockStore: { getState: () => h.state },
  keyOf: (
    bookId: string,
    t: { step: number; resource_type: number; resource_id: string; locale: string | null },
  ) => `${bookId}|${t.step}|${t.resource_type}|${t.resource_id}|${t.locale ?? ''}`,
  FALLBACK_HOLDER_NAME: 'another editor',
}));

const FIXTURE_NODE = { id: 'img1', title: 'Img', media_url: 'v1.png', illustrations: [] };
const updateRetouchImage = vi.fn();
vi.mock('@/stores/snapshot-store/selectors', () => ({
  useRetouchImageById: () => FIXTURE_NODE,
  useSnapshotActions: () => ({ updateRetouchImage }),
  findRetouchImageNode: () => FIXTURE_NODE, // imperative fresh-node read → the same fixture
}));
vi.mock('@/stores/snapshot-store', () => ({
  useSnapshotStore: { getState: () => ({}) }, // findRetouchImageNode is mocked → state ignored
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

import { RetouchEditImageModal } from './retouch-edit-image-modal';
import { toast } from 'sonner';

const infoToast = vi.mocked(toast.info);
const errorToast = vi.mocked(toast.error);

// Drain the fire-and-forget persist chain (acquire → save → release awaits).
const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise<void>((r) => setTimeout(r, 0));
};

const EXPECTED_TARGET = { step: 2, resource_type: 1, resource_id: 'img1', locale: null };

function renderModal() {
  return render(<RetouchEditImageModal open onOpenChange={() => {}} spreadId="sp1" imageId="img1" />);
}

describe('RetouchEditImageModal — collab per-resource save wiring', () => {
  beforeEach(() => {
    cleanup();
    h.acquire.mockReset();
    h.save.mockReset();
    h.release.mockReset();
    h.release.mockResolvedValue(undefined);
    h.state.collabPersist = false;
    h.state.registry.clear();
    h.state.holderNames.clear();
    updateRetouchImage.mockReset();
    infoToast.mockReset();
    errorToast.mockReset();
  });

  it('collab OFF: local update only, NO gateway acquire/save (solo path unchanged)', async () => {
    renderModal();
    fireEvent.click(screen.getByText('commit'));
    await flush();

    expect(updateRetouchImage).toHaveBeenCalledWith('sp1', 'img1', { illustrations: expect.any(Array) });
    expect(h.acquire).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });

  it('collab ON: persists node under lock — target {step:2,rtype:1,id:imageId}, action 3, releases', async () => {
    h.state.collabPersist = true;
    h.acquire.mockResolvedValue({ ok: true });
    h.save.mockResolvedValue({ ok: true });
    renderModal();
    fireEvent.click(screen.getByText('commit'));
    await flush();

    expect(updateRetouchImage).toHaveBeenCalledTimes(1); // local mutate still applied
    expect(h.acquire).toHaveBeenCalledWith(EXPECTED_TARGET);
    expect(h.save).toHaveBeenCalledTimes(1);
    const [target, payload] = h.save.mock.calls[0];
    expect(target).toEqual(EXPECTED_TARGET);
    expect(payload.action_type).toBe(3); // edit
    expect(payload.log).toBe(true);
    expect(payload.patch).toBe(FIXTURE_NODE); // fresh retouch image node
    expect(payload.target_ref).toEqual({ spread_id: 'sp1', kind: 'image' });
    expect(h.release).toHaveBeenCalledWith(EXPECTED_TARGET);
  });

  it('collab ON: acquire 409 → skipped + locked-by toast, NO save', async () => {
    h.state.collabPersist = true;
    h.acquire.mockResolvedValue({ ok: false, code: 'LOCK_HELD', holder: 'u2' });
    h.state.registry.set('book-1|2|1|img1|', { holder_user_id: 'u2' });
    h.state.holderNames.set('u2', 'Bob');
    renderModal();
    fireEvent.click(screen.getByText('commit'));
    await flush();

    expect(h.save).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled(); // no lock held → nothing to release
    expect(infoToast).toHaveBeenCalledTimes(1);
    expect(infoToast.mock.calls[0][0]).toContain('Bob');
    expect(errorToast).not.toHaveBeenCalled();
  });

  it('collab ON: save 403 → forbidden toast, no crash, still releases', async () => {
    h.state.collabPersist = true;
    h.acquire.mockResolvedValue({ ok: true });
    h.save.mockResolvedValue({ ok: false, lost: false, forbidden: true });
    renderModal();
    fireEvent.click(screen.getByText('commit'));
    await flush();

    expect(errorToast).toHaveBeenCalledTimes(1); // "cần quyền illustration"
    expect(infoToast).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledWith(EXPECTED_TARGET);
  });
});
