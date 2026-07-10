// characters-slice.test.ts — focused unit test for `revertEntityNode` (ADR-044 §Revision
// 2026-07-10 per-entity HELD session, onLost revert). Entities are per-entity grain
// (ownedKeys=undefined → whole node), so the revert REPLACES the whole entity node with the
// pre-edit baseline clone. The action lives in the characters slice but is cross-column: it
// addresses characters/props/stages via the `kind` discriminator. No-op (no throw) on unknown key
// or null baseline; siblings + other columns untouched.

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

describe('revertEntityNode', () => {
  beforeEach(() => {
    useSnapshotStore.setState((s) => {
      // Post-edit state: char c1 got a renamed name + an EXTRA variant + a new voice_setting.
      s.characters = asState([
        {
          key: 'c1',
          name: 'EDITED NAME',
          variants: [{ key: 'base' }, { key: 'ADDED' }],
          voice_setting: { voice_id: 'v-new' },
        },
        { key: 'c2', name: 'keep', variants: [] },
      ]);
      s.props = asState([{ key: 'p1', name: 'prop-edited', variants: [{ key: 'x' }] }]);
      s.stages = asState([{ key: 's1', name: 'stage-edited', variants: [], sounds: [{ key: 'snd' }] }]);
      s.sync.isDirty = false;
    });
  });

  it('replaces the whole CHARACTER node with the baseline clone + dirties', () => {
    const baseline = { key: 'c1', name: 'ORIGINAL', variants: [{ key: 'base' }], voice_setting: null };
    useSnapshotStore.getState().revertEntityNode('character', 'c1', baseline);

    const c1 = useSnapshotStore.getState().characters[0] as unknown as Record<string, unknown>;
    expect(c1.name).toBe('ORIGINAL');
    expect(c1.variants).toEqual([{ key: 'base' }]); // added variant dropped
    expect(c1.voice_setting).toBeNull(); // new voice_setting dropped
    // Sibling untouched.
    const c2 = useSnapshotStore.getState().characters[1] as unknown as Record<string, unknown>;
    expect(c2.name).toBe('keep');
    expect(useSnapshotStore.getState().sync.isDirty).toBe(true);
  });

  it('does not alias the baseline object (structuredClone)', () => {
    const baseline = { key: 'c1', name: 'ORIGINAL', variants: [{ key: 'base' }], voice_setting: null };
    useSnapshotStore.getState().revertEntityNode('character', 'c1', baseline);
    // Mutating the reverted node in-store must NOT mutate the caller's baseline object.
    useSnapshotStore.setState((s) => {
      (s.characters[0] as unknown as Record<string, unknown>).name = 'MUTATED';
    });
    expect(baseline.name).toBe('ORIGINAL');
  });

  it('reverts a PROP node (cross-column via kind)', () => {
    const baseline = { key: 'p1', name: 'prop-original', variants: [] };
    useSnapshotStore.getState().revertEntityNode('prop', 'p1', baseline);
    const p1 = useSnapshotStore.getState().props[0] as unknown as Record<string, unknown>;
    expect(p1.name).toBe('prop-original');
    expect(p1.variants).toEqual([]);
    expect(useSnapshotStore.getState().sync.isDirty).toBe(true);
  });

  it('reverts a STAGE node (cross-column via kind)', () => {
    const baseline = { key: 's1', name: 'stage-original', variants: [], sounds: [] };
    useSnapshotStore.getState().revertEntityNode('stage', 's1', baseline);
    const s1 = useSnapshotStore.getState().stages[0] as unknown as Record<string, unknown>;
    expect(s1.name).toBe('stage-original');
    expect(s1.sounds).toEqual([]); // added sound dropped
  });

  it('no-op (no throw) when the entity key is unknown', () => {
    expect(() =>
      useSnapshotStore.getState().revertEntityNode('character', 'does-not-exist', { key: 'x' }),
    ).not.toThrow();
    // Column untouched.
    const c1 = useSnapshotStore.getState().characters[0] as unknown as Record<string, unknown>;
    expect(c1.name).toBe('EDITED NAME');
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });

  it('no-op (no throw) when the baseline is null', () => {
    expect(() =>
      useSnapshotStore.getState().revertEntityNode('character', 'c1', null),
    ).not.toThrow();
    const c1 = useSnapshotStore.getState().characters[0] as unknown as Record<string, unknown>;
    expect(c1.name).toBe('EDITED NAME'); // unchanged
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });
});
