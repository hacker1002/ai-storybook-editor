// sketch-merge-degraded.test.ts — ADR-047 phase-05: a peer sync carrying an unreadable sketch
// node must merge a PLACEHOLDER and mark the resource DEGRADED synchronously with the merge
// (same consent machinery as the load path); a burst collapses via resource+sig dedupe. Drives
// the REAL store via `handleActivityInsert` (mirrors sketch-height-coercion.test.ts — proves the
// wiring, not just the coercer).

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

// No locks held → every scope proceeds to merge.
vi.mock('@/stores/resource-lock-store', () => ({
  holdsLiveLock: () => false,
  hasAnyLiveLock: () => false,
}));

import { useContentSyncStore } from '@/stores/content-sync-store';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { sigOf, consentKey, writeAccepted } from '@/utils/sketch-consent-storage';
import type { ActivityLogRawRow } from '@/stores/content-sync-store/types';

const VERSION = 'snap-1';
const asState = <T,>(v: T) => v as never;

const peerRow = (sync: unknown): ActivityLogRawRow =>
  ({ id: 'log-1', actor_user_id: 'peer-user', metadata: { sync } }) as unknown as ActivityLogRawRow;

const sheetNodeSync = {
  scope: 'node',
  version: VERSION,
  step: 1,
  resource_type: 11,
  resource_id: 'character_sheet',
  locale: null,
  column: 'sketch',
  path: ['base', 'character_sheet'],
};

/** Let the fire-and-forget `void applySync(...)` chain settle (2 awaits deep). */
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('content-sync merge — unreadable peer node degrades the resource (ADR-047)', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchSnapshotNode.mockReset();
    useContentSyncStore.setState({ bookId: 'book-1', myUserId: 'me', status: 'live' });
    useSnapshotStore.setState((s) => {
      s.meta.id = VERSION;
      s.sketchDegraded = [];
      s.sketchQuarantine = {};
      s.sketch = asState({
        id: VERSION,
        base: { character_sheet: { styles: [{ style_prompt: 'w', is_selected: true, image_references: [], illustrations: [], crops: [] }] }, prop_sheet: { styles: [] } },
        characters: [],
        props: [],
        stages: [],
        spreads: [],
      });
    });
  });

  it('a malformed sheet node merges a placeholder + degrades base.character_sheet', async () => {
    fetchSnapshotNode.mockResolvedValue({ styles: 'garbage' });

    useContentSyncStore.getState().handleActivityInsert(peerRow(sheetNodeSync));
    await flush();

    const s = useSnapshotStore.getState();
    expect(s.sketch.base.character_sheet).toEqual({ styles: [] }); // placeholder merged, no crash
    expect(s.sketchDegraded.map((d) => d.resource)).toEqual(['base.character_sheet']);
    expect(s.sketchQuarantine['base.character_sheet']).toEqual({ styles: 'garbage' });
  });

  it('a VALID sheet node merges without degrading anything (parity — no false positives)', async () => {
    const sheet = { styles: [] };
    fetchSnapshotNode.mockResolvedValue(sheet);

    useContentSyncStore.getState().handleActivityInsert(peerRow(sheetNodeSync));
    await flush();

    expect(useSnapshotStore.getState().sketchDegraded).toEqual([]);
    expect(useSnapshotStore.getState().sketch.base.character_sheet).toEqual(sheet);
  });

  it('a burst of malformed syncs lands as ONE deduped entry (resource+sig dedupe)', async () => {
    fetchSnapshotNode.mockResolvedValue({ styles: 'garbage' });

    const store = useContentSyncStore.getState();
    store.handleActivityInsert(peerRow(sheetNodeSync));
    store.handleActivityInsert(peerRow(sheetNodeSync));
    store.handleActivityInsert(peerRow(sheetNodeSync));
    await flush();

    expect(useSnapshotStore.getState().sketchDegraded).toHaveLength(1);
  });

  it('an ALREADY-ACCEPTED blob (localStorage sig-key) merges silently — no re-ask, no degraded', async () => {
    const garbage = { styles: 'garbage' };
    writeAccepted(consentKey(VERSION, 'base.character_sheet', sigOf(garbage)));
    fetchSnapshotNode.mockResolvedValue(garbage);

    useContentSyncStore.getState().handleActivityInsert(peerRow(sheetNodeSync));
    await flush();

    expect(useSnapshotStore.getState().sketchDegraded).toEqual([]);
    // Placeholder still merged (the garbage never enters the typed tree).
    expect(useSnapshotStore.getState().sketch.base.character_sheet).toEqual({ styles: [] });
  });
});
