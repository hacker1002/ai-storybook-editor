import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase so importing the REAL store (which flushSnapshot lives on) doesn't init a client.
// flushSnapshot only orchestrates autoSaveSnapshot + the subscribeWithSelector(sync.isSaving) wait,
// so we override autoSaveSnapshot per-test and never touch the mocked client directly.
vi.mock('@/apis/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    from: vi.fn(),
  },
}));

import { useSnapshotStore } from '@/stores/snapshot-store';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('flushSnapshot (awaited flush contract)', () => {
  beforeEach(() => {
    useSnapshotStore.setState((s) => {
      s.meta.bookId = 'book-1';
      s.sync.isDirty = false;
      s.sync.isSaving = false;
      s.sync.error = null;
    });
  });

  it('resolves immediately when already clean (never calls autoSave)', async () => {
    const autoSave = vi.fn(async () => {});
    useSnapshotStore.setState({ autoSaveSnapshot: autoSave });

    await useSnapshotStore.getState().flushSnapshot();

    expect(autoSave).not.toHaveBeenCalled();
  });

  it('normal path: dirty + not saving → runs autoSave and lands (isDirty→false)', async () => {
    const autoSave = vi.fn(async () => {
      useSnapshotStore.setState((s) => {
        s.sync.isDirty = false;
      });
    });
    useSnapshotStore.setState((s) => {
      s.sync.isDirty = true;
      s.autoSaveSnapshot = autoSave;
    });

    await useSnapshotStore.getState().flushSnapshot();

    expect(autoSave).toHaveBeenCalledTimes(1);
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });

  it('rare path: a concurrent save holds isSaving → waits for isSaving→false, then re-checks isDirty', async () => {
    // Mimic the real autoSaveSnapshot self-guard: no-op while another save holds isSaving.
    const autoSave = vi.fn(async () => {
      if (useSnapshotStore.getState().sync.isSaving) return;
      useSnapshotStore.setState((s) => {
        s.sync.isDirty = false;
      });
    });
    useSnapshotStore.setState((s) => {
      s.sync.isDirty = true;
      s.sync.isSaving = true;
      s.autoSaveSnapshot = autoSave;
    });

    const pending = useSnapshotStore.getState().flushSnapshot();
    await tick(); // first autoSave no-ops (isSaving) → flush subscribes to sync.isSaving

    // The concurrent save completes and lands our write: flip isSaving off + isDirty clean.
    useSnapshotStore.setState((s) => {
      s.sync.isSaving = false;
      s.sync.isDirty = false;
    });

    await pending; // must resolve now that isSaving flipped false and state is clean

    expect(autoSave).toHaveBeenCalled();
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });
});
