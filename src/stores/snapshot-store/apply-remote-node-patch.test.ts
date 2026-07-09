import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock supabase so importing the REAL snapshot store (where the merge actions live) does
// not initialise a client. The merge actions are pure state mutations — no client touched.
vi.mock('@/apis/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    from: vi.fn(),
  },
}));

import { useSnapshotStore } from '@/stores/snapshot-store';

// Minimal shapes cast through `as never` — the store slices are strongly typed but these
// tests exercise the generic path-walk merge, not the domain types.
const asState = <T>(v: T) => v as never;

const makeSketch = () =>
  asState({
    id: 'snap-1',
    // Sketch entities are `key`-identified (SketchEntity has key, no id) — distinct from
    // spreads which are `id`-identified. Reconcile must match on `id ?? key`.
    characters: [
      { key: 'ck0', name: 'Aria', variants: [{ key: 'v', media_url: 'local-edit' }] },
      { key: 'ck1', name: 'Bram', variants: [] },
      { key: 'ck2', name: 'Cleo', variants: [] },
    ],
    props: [],
    stages: [],
    spreads: [
      { id: 'sp1', images: [], pages: [], textboxes: [{ id: 't1', text: 'in-progress' }] },
      { id: 'sp2', images: [], pages: [], textboxes: [] },
      { id: 'sp3', images: [], pages: [], textboxes: [] },
    ],
  });

const makeCharacters = () =>
  asState([
    { key: 'c0', name: 'Alice', variants: [{ key: 'v0' }] },
    { key: 'c1', name: 'Bob', variants: [] },
  ]);

describe('applyRemoteNodePatch (collab merge — no dirty, no sibling)', () => {
  beforeEach(() => {
    useSnapshotStore.setState((s) => {
      s.sketch = makeSketch();
      s.characters = makeCharacters();
      s.sync.isDirty = false;
    });
  });

  it('sets an object-key node without flipping isDirty or touching siblings', () => {
    useSnapshotStore.getState().applyRemoteNodePatch('sketch', ['spreads', '1', 'textboxes'], [
      { id: 't9', text: 'remote' },
    ]);
    const st = useSnapshotStore.getState();
    expect(st.sketch.spreads[1].textboxes).toEqual([{ id: 't9', text: 'remote' }]);
    // Sibling spreads untouched.
    expect(st.sketch.spreads[0].textboxes).toEqual([{ id: 't1', text: 'in-progress' }]);
    expect(st.sketch.spreads[2].id).toBe('sp3');
    expect(st.sync.isDirty).toBe(false);
  });

  it('sets a bare-array column node (characters[0].name) — no dirty', () => {
    useSnapshotStore.getState().applyRemoteNodePatch('characters', ['0', 'name'], 'Alicia');
    const st = useSnapshotStore.getState();
    expect((st.characters[0] as { name: string }).name).toBe('Alicia');
    expect((st.characters[1] as { name: string }).name).toBe('Bob'); // sibling untouched
    expect(st.sync.isDirty).toBe(false);
  });

  it('removes an array node when value is null (parent shrinks) — no dirty', () => {
    useSnapshotStore.getState().applyRemoteNodePatch('sketch', ['spreads', '1'], null);
    const st = useSnapshotStore.getState();
    expect(st.sketch.spreads.map((sp) => sp.id)).toEqual(['sp1', 'sp3']);
    expect(st.sync.isDirty).toBe(false);
  });

  it('no-op on missing intermediate (does not create path, no dirty)', () => {
    const before = JSON.stringify(useSnapshotStore.getState().sketch);
    useSnapshotStore.getState().applyRemoteNodePatch('sketch', ['spreads', '9', 'textboxes'], []);
    const st = useSnapshotStore.getState();
    expect(JSON.stringify(st.sketch)).toBe(before);
    expect(st.sync.isDirty).toBe(false);
  });

  it('no-op on empty path (whole-column guard, no dirty)', () => {
    const before = JSON.stringify(useSnapshotStore.getState().characters);
    useSnapshotStore.getState().applyRemoteNodePatch('characters', [], []);
    const st = useSnapshotStore.getState();
    expect(JSON.stringify(st.characters)).toBe(before);
    expect(st.sync.isDirty).toBe(false);
  });
});

describe('reconcileCollectionByIds (reorder/delete — keep local object)', () => {
  beforeEach(() => {
    useSnapshotStore.setState((s) => {
      s.sketch = makeSketch();
      s.sync.isDirty = false;
    });
  });

  it('adopts server order, keeps local object for matching id (preserves in-progress edit), drops removed id', () => {
    // Server: reordered [sp2, sp1]; sp3 deleted; sp1 fetched copy is STALE (no in-progress edit).
    useSnapshotStore.getState().reconcileCollectionByIds('sketch', ['spreads'], [
      { id: 'sp2', images: [], pages: [], textboxes: [] },
      { id: 'sp1', images: [], pages: [], textboxes: [] },
    ]);
    const spreads = useSnapshotStore.getState().sketch.spreads;
    expect(spreads.map((sp) => sp.id)).toEqual(['sp2', 'sp1']); // order adopted
    // Local sp1 object kept → the in-progress textbox edit survives the reorder.
    expect(spreads[1].textboxes).toEqual([{ id: 't1', text: 'in-progress' }]);
    expect(spreads.find((sp) => sp.id === 'sp3')).toBeUndefined(); // removed id dropped
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });

  it('uses the fetched object for a brand-new id', () => {
    useSnapshotStore.getState().reconcileCollectionByIds('sketch', ['spreads'], [
      { id: 'sp1', images: [], pages: [], textboxes: [] },
      { id: 'sp4', images: [], pages: [], textboxes: [{ id: 'tNew', text: 'fetched' }] },
    ]);
    const spreads = useSnapshotStore.getState().sketch.spreads;
    expect(spreads.map((sp) => sp.id)).toEqual(['sp1', 'sp4']);
    expect(spreads[1].textboxes).toEqual([{ id: 'tNew', text: 'fetched' }]); // fetched used
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });

  it('reconciles a KEY-identified collection (sketch.characters) — reorder keeps local edit, delete drops id', () => {
    // Server: reordered [ck2, ck0], ck1 deleted; ck0 fetched copy is STALE (no local edit).
    useSnapshotStore.getState().reconcileCollectionByIds('sketch', ['characters'], [
      { key: 'ck2', name: 'Cleo', variants: [] },
      { key: 'ck0', name: 'Aria', variants: [] },
    ]);
    const chars = useSnapshotStore.getState().sketch.characters;
    expect(chars.map((c) => c.key)).toEqual(['ck2', 'ck0']); // order adopted (no [dup,dup] collapse)
    // Local ck0 object kept → the in-progress variant edit survives (matched by `key`, not `id`).
    expect(chars[1].variants).toEqual([{ key: 'v', media_url: 'local-edit' }]);
    expect(chars.find((c) => c.key === 'ck1')).toBeUndefined(); // deleted key dropped
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });

  it('no-op when the local node at path is not an array', () => {
    // sketch.id is a string, not an array → reconcile bails.
    const before = JSON.stringify(useSnapshotStore.getState().sketch);
    useSnapshotStore.getState().reconcileCollectionByIds('sketch', ['id'], [{ id: 'x' }]);
    expect(JSON.stringify(useSnapshotStore.getState().sketch)).toBe(before);
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });
});

// P04b: bare-array TOP-LEVEL columns (characters/props/stages) — path=[]. Previously the
// reconcile was a no-op here (setNodeAtPath refuses the empty path); the fix replaces the
// whole column directly (collection scope), identity-preserving. Node-scope whole-column
// writes must STILL be refused via applyRemoteNodePatch's empty-path guard (unchanged).
describe('reconcileCollectionByIds (bare-array top-level column — P04b fix)', () => {
  const makeChars3 = () =>
    asState([
      { key: 'c0', name: 'Alice', variants: [{ key: 'v0', media_url: 'local-edit' }] },
      { key: 'c1', name: 'Bob', variants: [] },
      { key: 'c2', name: 'Cara', variants: [] },
    ]);

  beforeEach(() => {
    useSnapshotStore.setState((s) => {
      s.characters = makeChars3();
      s.props = asState([{ key: 'p0', name: 'Ball' }, { key: 'p1', name: 'Box' }]);
      s.stages = asState([{ key: 's0', name: 'Park' }, { key: 's1', name: 'Home' }]);
      s.sync.isDirty = false;
    });
  });

  it('reorders a bare characters column (path=[]) — adopts server order, keeps local edit', () => {
    // Server: reordered [c2, c0, c1]; c0 fetched copy is STALE (no in-progress variant edit).
    useSnapshotStore.getState().reconcileCollectionByIds('characters', [], [
      { key: 'c2', name: 'Cara', variants: [] },
      { key: 'c0', name: 'Alice', variants: [] },
      { key: 'c1', name: 'Bob', variants: [] },
    ]);
    const chars = useSnapshotStore.getState().characters as unknown as Array<{ key: string; variants: unknown[] }>;
    expect(chars.map((c) => c.key)).toEqual(['c2', 'c0', 'c1']); // order adopted (no no-op)
    // Local c0 object kept → in-progress variant edit survives (matched by `key`, not `id`).
    expect(chars[1].variants).toEqual([{ key: 'v0', media_url: 'local-edit' }]);
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });

  it('deletes from a bare characters column (path=[]) — drops removed key, keeps local edit', () => {
    // Server: c1 deleted → [c0, c2].
    useSnapshotStore.getState().reconcileCollectionByIds('characters', [], [
      { key: 'c0', name: 'Alice', variants: [] },
      { key: 'c2', name: 'Cara', variants: [] },
    ]);
    const chars = useSnapshotStore.getState().characters as unknown as Array<{ key: string; variants: unknown[] }>;
    expect(chars.map((c) => c.key)).toEqual(['c0', 'c2']); // c1 dropped, no leftover/dup
    expect(chars.find((c) => c.key === 'c1')).toBeUndefined();
    // Local c0 kept (identity match) → edit preserved through the delete reconcile.
    expect(chars[0].variants).toEqual([{ key: 'v0', media_url: 'local-edit' }]);
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });

  it('reconciles bare props + stages columns too (path=[])', () => {
    useSnapshotStore.getState().reconcileCollectionByIds('props', [], [
      { key: 'p1', name: 'Box' },
      { key: 'p0', name: 'Ball' },
    ]);
    useSnapshotStore.getState().reconcileCollectionByIds('stages', [], [{ key: 's1', name: 'Home' }]);
    const st = useSnapshotStore.getState();
    expect((st.props as unknown as Array<{ key: string }>).map((p) => p.key)).toEqual(['p1', 'p0']);
    expect((st.stages as unknown as Array<{ key: string }>).map((s) => s.key)).toEqual(['s1']); // s0 dropped
    expect(st.sync.isDirty).toBe(false);
  });

  it('node-scope whole-column write STILL refused (applyRemoteNodePatch empty path is a no-op)', () => {
    const before = JSON.stringify(useSnapshotStore.getState().characters);
    // A node-scope patch must NEVER clobber the whole column — even with a non-empty payload.
    useSnapshotStore.getState().applyRemoteNodePatch('characters', [], [{ key: 'zzz', name: 'Intruder' }]);
    expect(JSON.stringify(useSnapshotStore.getState().characters)).toBe(before);
    expect(useSnapshotStore.getState().sync.isDirty).toBe(false);
  });
});
