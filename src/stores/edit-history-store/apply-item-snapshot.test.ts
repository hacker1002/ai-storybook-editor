import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/apis/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    from: vi.fn(),
  },
}));

import { useSnapshotStore } from '@/stores/snapshot-store';
import { applyItemSnapshot } from './apply-item-snapshot';

const asState = <T>(v: T) => v as never;

beforeEach(() => {
  useSnapshotStore.setState((s) => {
    s.illustration = asState({
      spreads: [
        {
          id: 'sp1',
          // scene-owned
          raw_images: [{ id: 'X' }],
          raw_textboxes: [],
          // retouch-owned
          images: [{ id: 'IMG' }],
          textboxes: [{ id: 'TB' }],
        },
      ],
      sections: [],
    });
    s.characters = asState([{ key: 'c1', name: 'Old', variants: [] }]);
    s.sync.isDirty = false;
  });
});

describe('applyItemSnapshot — scene/retouch owned-key MERGE', () => {
  it('scene merge overwrites scene keys but PRESERVES retouch keys + id (mirror backend)', () => {
    applyItemSnapshot('illustration-scene:6:sp1:∅', { raw_images: [{ id: 'Y' }] });
    const sp = useSnapshotStore.getState().illustration.spreads[0] as unknown as Record<string, unknown>;
    expect(sp.raw_images).toEqual([{ id: 'Y' }]); // scene overwritten
    expect(sp.images).toEqual([{ id: 'IMG' }]); // retouch pipeline preserved
    expect(sp.textboxes).toEqual([{ id: 'TB' }]); // retouch pipeline preserved
    expect(sp.id).toBe('sp1'); // id never touched
    expect(useSnapshotStore.getState().sync.isDirty).toBe(true); // dirties for release-save
  });

  it('retouch merge overwrites retouch keys but PRESERVES scene keys + id', () => {
    applyItemSnapshot('retouch:10:sp1:∅', { images: [{ id: 'Z' }] });
    const sp = useSnapshotStore.getState().illustration.spreads[0] as unknown as Record<string, unknown>;
    expect(sp.images).toEqual([{ id: 'Z' }]); // retouch overwritten
    expect(sp.raw_images).toEqual([{ id: 'X' }]); // scene pipeline preserved
    expect(sp.id).toBe('sp1');
  });

  it('a key absent from the payload is NO-OPed (not deleted)', () => {
    // payload has raw_images only — raw_textboxes must remain as-is (backend no-op on absent).
    applyItemSnapshot('illustration-scene:6:sp1:∅', { raw_images: [{ id: 'Y' }] });
    const sp = useSnapshotStore.getState().illustration.spreads[0] as unknown as Record<string, unknown>;
    expect(sp.raw_textboxes).toEqual([]);
  });
});

describe('applyItemSnapshot — entity WHOLE-node replace', () => {
  it('replaces the whole entity node at its index', () => {
    applyItemSnapshot('illustration-entity:3:c1:∅', {
      key: 'c1',
      name: 'New',
      variants: [{ key: 'v' }],
    });
    const c = useSnapshotStore.getState().characters[0];
    expect(c).toEqual({ key: 'c1', name: 'New', variants: [{ key: 'v' }] });
    expect(useSnapshotStore.getState().sync.isDirty).toBe(true);
  });
});

describe('applyItemSnapshot — unresolved key', () => {
  it('no-ops on a gone resource (no throw, no dirty)', () => {
    applyItemSnapshot('illustration-scene:6:GONE:∅', { raw_images: [{ id: 'Y' }] });
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });
});
