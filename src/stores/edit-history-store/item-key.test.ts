import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase so importing the REAL snapshot store (read by the resolver) does not
// initialise a client. The resolver only reads state — no client touched.
vi.mock('@/apis/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    from: vi.fn(),
  },
}));

import { useSnapshotStore } from '@/stores/snapshot-store';
import {
  SCENE_OWNED_KEYS,
  RETOUCH_OWNED_KEYS,
} from '@/stores/snapshot-store/slices/collab-owned-subtree';
import {
  buildItemKey,
  parseItemKey,
  resolveItemAddress,
  selectItemSubtree,
  NO_LOCALE,
} from './item-key';
import type { LockTarget } from '@/stores/resource-lock-store';

const asState = <T>(v: T) => v as never;

const t = (resource_type: number, resource_id: string, locale: string | null = null): LockTarget =>
  ({ step: 2, resource_type, resource_id, locale } as LockTarget);

beforeEach(() => {
  useSnapshotStore.setState((s) => {
    s.illustration = asState({
      spreads: [
        { id: 'sp0', raw_images: [], images: [] },
        { id: 'sp1', raw_images: [{ id: 'X' }], images: [{ id: 'IMG' }] },
      ],
      sections: [],
    });
    s.characters = asState([{ key: 'ca', name: 'A' }, { key: 'cb', name: 'B' }]);
    s.props = asState([{ key: 'pa', name: 'P' }]);
    s.stages = asState([{ key: 'sa', name: 'S' }]);
  });
});

describe('buildItemKey / parseItemKey', () => {
  it('builds the ∅-locale key and round-trips', () => {
    const key = buildItemKey('illustration-scene', t(6, 'sp1'));
    expect(key).toBe(`illustration-scene:6:sp1:${NO_LOCALE}`);
    expect(parseItemKey(key)).toEqual({
      domain: 'illustration-scene',
      resourceType: 6,
      resourceId: 'sp1',
      locale: null,
    });
  });

  it('preserves a real locale', () => {
    const key = buildItemKey('retouch', t(10, 'sp1', 'en'));
    expect(key).toBe('retouch:10:sp1:en');
    expect(parseItemKey(key)?.locale).toBe('en');
  });

  it('returns null on a malformed key', () => {
    expect(parseItemKey('not-a-key')).toBeNull();
    expect(parseItemKey('a:b:c:d')).toBeNull(); // b not numeric
  });
});

describe('resolveItemAddress', () => {
  it('scene → illustration column, spreads[idx], SCENE_OWNED_KEYS subtree grain', () => {
    const addr = resolveItemAddress(useSnapshotStore.getState(), 'illustration-scene:6:sp1:∅');
    expect(addr).toEqual({
      column: 'illustration',
      path: ['spreads', '1'],
      grain: 'subtree',
      ownedKeys: SCENE_OWNED_KEYS,
    });
  });

  it('retouch → illustration column, spreads[idx], RETOUCH_OWNED_KEYS subtree grain', () => {
    const addr = resolveItemAddress(useSnapshotStore.getState(), 'retouch:10:sp1:∅');
    expect(addr?.ownedKeys).toBe(RETOUCH_OWNED_KEYS);
    expect(addr?.path).toEqual(['spreads', '1']);
  });

  it('entity (character/prop/stage) → correct column + [idx], node grain', () => {
    const st = useSnapshotStore.getState();
    expect(resolveItemAddress(st, 'illustration-entity:3:cb:∅')).toEqual({
      column: 'characters',
      path: ['1'],
      grain: 'node',
    });
    expect(resolveItemAddress(st, 'illustration-entity:4:pa:∅')).toEqual({
      column: 'props',
      path: ['0'],
      grain: 'node',
    });
    expect(resolveItemAddress(st, 'illustration-entity:5:sa:∅')).toEqual({
      column: 'stages',
      path: ['0'],
      grain: 'node',
    });
  });

  it('returns null for a missing resource or the reserved sketch domain', () => {
    const st = useSnapshotStore.getState();
    expect(resolveItemAddress(st, 'illustration-scene:6:GONE:∅')).toBeNull();
    expect(resolveItemAddress(st, 'illustration-entity:3:GONE:∅')).toBeNull();
    expect(resolveItemAddress(st, 'sketch:1:x:∅')).toBeNull();
  });
});

describe('selectItemSubtree', () => {
  it('scene → owned-key projection only (no retouch keys)', () => {
    const sub = selectItemSubtree(useSnapshotStore.getState(), 'illustration-scene:6:sp1:∅') as Record<string, unknown>;
    expect(sub.raw_images).toEqual([{ id: 'X' }]);
    expect('images' in sub).toBe(false); // retouch key excluded
  });

  it('entity → the whole node', () => {
    const node = selectItemSubtree(useSnapshotStore.getState(), 'illustration-entity:3:cb:∅');
    expect(node).toEqual({ key: 'cb', name: 'B' });
  });
});
