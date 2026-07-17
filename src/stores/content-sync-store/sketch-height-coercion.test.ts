// Regression: the realtime content-sync merge is a SECOND read boundary for snapshot data.
// `normalizeSketch` (full-load coercion) does NOT run here — a peer event refetches a sub-node
// straight from DB jsonb. Since the 2026-07-17 `height` string→number|null migration is read-time
// only (no DB backfill), a legacy `"~110cm"` string would re-enter a `number | null` field through
// this path. These tests drive the REAL store via `handleActivityInsert` (the channel's entry
// point) so they prove the wiring, not just the coercer.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase so importing the real stores never initialises a client.
vi.mock('@/apis/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    from: vi.fn(),
    rpc: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

// The RPC read is the seam we control: it stands in for "what the DB actually holds".
const fetchSnapshotNode = vi.fn();
vi.mock('@/stores/content-sync-store/rpc', () => ({ fetchSnapshotNode: (...a: unknown[]) => fetchSnapshotNode(...a) }));

// No locks held → every scope proceeds to merge (the `set` scope skips on ANY live lock).
vi.mock('@/stores/resource-lock-store', () => ({
  holdsLiveLock: () => false,
  hasAnyLiveLock: () => false,
}));

import { useContentSyncStore } from '@/stores/content-sync-store';
import { useSnapshotStore } from '@/stores/snapshot-store';
import type { ActivityLogRawRow } from '@/stores/content-sync-store/types';

const VERSION = 'snap-1';
const asState = <T>(v: T) => v as never;

/** A peer INSERT carrying a sync envelope (actor != me → never self-filtered). */
const peerRow = (sync: unknown): ActivityLogRawRow =>
  ({ id: 'log-1', actor_user_id: 'peer-user', metadata: { sync } }) as unknown as ActivityLogRawRow;

/** Let the fire-and-forget `void applySync(...)` chain settle (2 awaits deep). */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A legacy DB blob: `height` is still the pre-migration STRING. */
const legacyEntity = (key: string, height: unknown) => ({
  key,
  variants: [{ key: 'v0', description: '', visual_design: '', art_language: '', height }],
});

const heightOf = (kind: 'characters' | 'props' | 'stages', idx = 0) =>
  useSnapshotStore.getState().sketch[kind][idx]?.variants[0]?.height;

describe('content-sync merge — legacy sketch `height` string is coerced at the boundary', () => {
  beforeEach(() => {
    fetchSnapshotNode.mockReset();
    useContentSyncStore.setState({ bookId: 'book-1', myUserId: 'me', status: 'live' });
    useSnapshotStore.setState((s) => {
      s.meta.id = VERSION;
      s.sketch = asState({ id: VERSION, base: {}, characters: [], props: [], stages: [], spreads: [] });
    });
  });

  it('`set` scope (generate summary → whole-replace sketch.characters) parses the string to cm', async () => {
    fetchSnapshotNode.mockResolvedValue([legacyEntity('ck0', '~110cm')]);

    useContentSyncStore.getState().handleActivityInsert(
      peerRow({ scope: 'set', version: VERSION, targets: [{ column: 'sketch', path: ['characters'] }] }),
    );
    await flush();

    expect(heightOf('characters')).toBe(110);
  });

  it('`node` scope (rtype 3/4 whole-entity node) parses the string to cm', async () => {
    useSnapshotStore.setState((s) => {
      s.sketch = asState({ id: VERSION, base: {}, characters: [legacyEntity('ck0', 0)], props: [], stages: [], spreads: [] });
    });
    fetchSnapshotNode.mockResolvedValue(legacyEntity('ck0', '1.1m')); // metres → ×100

    useContentSyncStore.getState().handleActivityInsert(
      peerRow({ scope: 'node', version: VERSION, step: 1, resource_type: 3, resource_id: 'ck0', locale: null, column: 'sketch', path: ['characters', '0'] }),
    );
    await flush();

    expect(heightOf('characters')).toBe(110);
  });

  it('`collection` scope adopts a non-matching (server-only) entity coerced, not raw', async () => {
    // Identity 'ck9' has no local counterpart → reconcile adopts the FETCHED object verbatim.
    fetchSnapshotNode.mockResolvedValue([legacyEntity('ck9', '20-30cm')]); // range → max

    useContentSyncStore.getState().handleActivityInsert(
      peerRow({ scope: 'collection', version: VERSION, column: 'sketch', path: ['characters'] }),
    );
    await flush();

    expect(heightOf('characters')).toBe(30);
  });

  it('an unparseable height lands as null (and never drops the variant)', async () => {
    fetchSnapshotNode.mockResolvedValue([legacyEntity('ck0', 'tall-ish')]);

    useContentSyncStore.getState().handleActivityInsert(
      peerRow({ scope: 'set', version: VERSION, targets: [{ column: 'sketch', path: ['characters'] }] }),
    );
    await flush();

    expect(heightOf('characters')).toBeNull();
    expect(useSnapshotStore.getState().sketch.characters[0].variants).toHaveLength(1);
  });

  it('an already-migrated number round-trips unchanged (idempotent — runs on every merge)', async () => {
    fetchSnapshotNode.mockResolvedValue([legacyEntity('ck0', 110)]);

    useContentSyncStore.getState().handleActivityInsert(
      peerRow({ scope: 'set', version: VERSION, targets: [{ column: 'sketch', path: ['characters'] }] }),
    );
    await flush();

    expect(heightOf('characters')).toBe(110);
  });

  it('a stage variant (no height by design) is NOT stamped with height:null', async () => {
    fetchSnapshotNode.mockResolvedValue([
      { key: 'sk0', variants: [{ key: 'v0', description: '', visual_design: '', art_language: '' }] },
    ]);

    useContentSyncStore.getState().handleActivityInsert(
      peerRow({ scope: 'set', version: VERSION, targets: [{ column: 'sketch', path: ['stages'] }] }),
    );
    await flush();

    const v = useSnapshotStore.getState().sketch.stages[0].variants[0];
    expect('height' in v).toBe(false);
  });

  it('a non-entity sketch path (spreads) passes through untouched', async () => {
    const spreads = [{ id: 'sp1', images: [], pages: [], textboxes: [] }];
    fetchSnapshotNode.mockResolvedValue(spreads);

    useContentSyncStore.getState().handleActivityInsert(
      peerRow({ scope: 'set', version: VERSION, targets: [{ column: 'sketch', path: ['spreads'] }] }),
    );
    await flush();

    expect(useSnapshotStore.getState().sketch.spreads).toEqual(spreads);
  });
});
