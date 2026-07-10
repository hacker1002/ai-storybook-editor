// illustration-slice.test.ts — focused unit test for `revertSceneOwnedSubtree` (ADR-044 per-spread
// SCENE held session, onLost revert). Restores the SCENE owned-key sub-tree of a spread to a
// pre-edit baseline: owned keys in the baseline are restored, owned keys ABSENT from the baseline
// are deleted (drops what was added since acquire), and RETOUCH keys are left untouched (disjoint
// partition — mirror of retouch-slice.test.ts).

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

// Post-edit spread state: I ADDED raw_image rNEW, raw_textbox tNEW, a `pages` entry and set
// `manuscript`/`branch_setting` — all SCENE keys to be reverted. `images` + `animations` are RETOUCH
// keys (must survive untouched).
const makePostEditSpread = () =>
  asState({
    id: 'sp1',
    raw_images: [{ id: 'r1' }, { id: 'rNEW' }],
    raw_textboxes: [{ id: 'tNEW' }],
    manuscript: { scene: 'edited' },
    branch_setting: { kind: 'added' },
    pages: [{ number: 0 }, { number: 1 }],
    images: [{ id: 'i1' }],
    animations: [{ order: 0 }],
  });

// Pre-edit baseline (SCENE owned sub-tree only) captured at acquire: no branch_setting / no
// raw_textboxes key at all (they were added after acquire).
const BASELINE = {
  raw_images: [{ id: 'r1' }],
  manuscript: { scene: 'original' },
  pages: [{ number: 0 }, { number: 1 }],
} as unknown;

describe('revertSceneOwnedSubtree', () => {
  beforeEach(() => {
    useSnapshotStore.setState((s) => {
      s.illustration.spreads = [makePostEditSpread(), asState({ id: 'sp2', raw_images: [] })];
      s.sync.isDirty = false;
    });
  });

  it('restores baseline SCENE keys + deletes SCENE keys absent from baseline, dirties', () => {
    useSnapshotStore.getState().revertSceneOwnedSubtree('sp1', BASELINE);
    const spread = useSnapshotStore.getState().illustration.spreads[0] as unknown as Record<string, unknown>;

    // SCENE keys present in baseline → restored to baseline value (added items dropped).
    expect(spread.raw_images).toEqual([{ id: 'r1' }]);
    expect(spread.manuscript).toEqual({ scene: 'original' });
    expect(spread.pages).toEqual([{ number: 0 }, { number: 1 }]);
    // SCENE keys ABSENT from baseline → deleted (dropped what was added since acquire).
    expect('raw_textboxes' in spread).toBe(false);
    expect('branch_setting' in spread).toBe(false);
    // RETOUCH keys (disjoint partition) untouched.
    expect(spread.images).toEqual([{ id: 'i1' }]);
    expect(spread.animations).toEqual([{ order: 0 }]);

    expect(useSnapshotStore.getState().sync.isDirty).toBe(true);
  });

  it('no-op (no throw) when the spread id is unknown', () => {
    expect(() =>
      useSnapshotStore.getState().revertSceneOwnedSubtree('does-not-exist', BASELINE),
    ).not.toThrow();
    // Target spread untouched.
    const sp1 = useSnapshotStore.getState().illustration.spreads[0] as unknown as Record<string, unknown>;
    expect(sp1.raw_images).toEqual([{ id: 'r1' }, { id: 'rNEW' }]);
  });

  it('treats a null baseline as {} — deletes every SCENE owned key present', () => {
    useSnapshotStore.getState().revertSceneOwnedSubtree('sp1', null);
    const spread = useSnapshotStore.getState().illustration.spreads[0] as unknown as Record<string, unknown>;
    // All SCENE keys removed…
    expect('raw_images' in spread).toBe(false);
    expect('raw_textboxes' in spread).toBe(false);
    expect('manuscript' in spread).toBe(false);
    expect('branch_setting' in spread).toBe(false);
    expect('pages' in spread).toBe(false);
    // …RETOUCH keys survive.
    expect(spread.images).toEqual([{ id: 'i1' }]);
    expect(spread.animations).toEqual([{ order: 0 }]);
  });
});
