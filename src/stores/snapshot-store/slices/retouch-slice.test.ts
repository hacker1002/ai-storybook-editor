// retouch-slice.test.ts — focused unit test for `revertRetouchOwnedSubtree` (ADR-044 per-spread
// held session, onLost revert). Restores the RETOUCH owned-key sub-tree of a spread to a pre-edit
// baseline: owned keys in the baseline are restored, owned keys ABSENT from the baseline are deleted
// (drops what was added since acquire), and SCENE keys are left untouched (disjoint partition).

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase so importing the REAL snapshot store does not initialise a client — the revert is a
// pure state mutation, no client touched.
vi.mock('@/apis/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    from: vi.fn(),
  },
}));

import { useSnapshotStore } from '@/stores/snapshot-store';

const asState = <T>(v: T) => v as never;

// Post-edit spread state: I ADDED image iNEW, textbox tNEW, video vNEW and animation #1, and edited
// audios — all to be dropped on revert. `raw_images` + `manuscript` are SCENE keys (must survive).
const makePostEditSpread = () =>
  asState({
    id: 'sp1',
    raw_images: [{ id: 'r1' }],
    manuscript: { scene: 'keep-me' },
    images: [{ id: 'i1' }, { id: 'iNEW' }],
    textboxes: [{ id: 'tNEW' }],
    videos: [{ id: 'vNEW' }],
    animations: [{ order: 0 }, { order: 1 }],
  });

// Pre-edit baseline (owned sub-tree only) captured at acquire: no videos key at all.
const BASELINE = {
  images: [{ id: 'i1' }],
  textboxes: [],
  animations: [{ order: 0 }],
} as unknown;

describe('revertRetouchOwnedSubtree', () => {
  beforeEach(() => {
    useSnapshotStore.setState((s) => {
      s.illustration.spreads = [makePostEditSpread(), asState({ id: 'sp2', images: [] })];
      s.sync.isDirty = false;
    });
  });

  it('restores baseline owned keys + deletes owned keys absent from baseline, dirties', () => {
    useSnapshotStore.getState().revertRetouchOwnedSubtree('sp1', BASELINE);
    const spread = useSnapshotStore.getState().illustration.spreads[0] as unknown as Record<string, unknown>;

    // Owned keys present in baseline → restored to baseline value (added items dropped).
    expect(spread.images).toEqual([{ id: 'i1' }]);
    expect(spread.textboxes).toEqual([]);
    expect(spread.animations).toEqual([{ order: 0 }]);
    // Owned key ABSENT from baseline → deleted (the added video is dropped).
    expect('videos' in spread).toBe(false);
    // SCENE keys (disjoint partition) untouched.
    expect(spread.raw_images).toEqual([{ id: 'r1' }]);
    expect(spread.manuscript).toEqual({ scene: 'keep-me' });

    expect(useSnapshotStore.getState().sync.isDirty).toBe(true);
  });

  it('no-op (no throw) when the spread id is unknown', () => {
    expect(() =>
      useSnapshotStore.getState().revertRetouchOwnedSubtree('does-not-exist', BASELINE),
    ).not.toThrow();
    // Sibling spread untouched.
    const sp1 = useSnapshotStore.getState().illustration.spreads[0] as unknown as Record<string, unknown>;
    expect(sp1.images).toEqual([{ id: 'i1' }, { id: 'iNEW' }]);
  });
});
