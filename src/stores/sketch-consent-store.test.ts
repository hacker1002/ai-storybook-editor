// sketch-consent-store.test.ts — T4 (ADR-047 phase-03): the consent flow. accept lifts the
// degraded state + persists 'accept' (only accept — D11: refuse is session-only, every reload
// re-asks); dismiss keeps everything degraded; a changed blob (new sig) re-asks even after an
// accept. End-to-end through the REAL initSnapshot → loadSketch path.

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

import { useSnapshotStore } from '@/stores/snapshot-store';
import { useSketchConsentStore, dismissKeyOf } from '@/stores/sketch-consent-store';
import { sigOf, consentKey, readAccepted, writeAccepted } from '@/utils/sketch-consent-storage';

const SNAP_ID = 'snap-1';

/** A sketch blob whose character sheet is unreadable (the reported production shape). */
const brokenSheetBlob = () => ({
  id: 'sk1',
  base: { character_sheet: { styles: 'garbage' }, prop_sheet: { styles: [] } },
  characters: [{ key: 'kid', variants: [] }],
});

/** The quarantine payload loadSketch derives for that blob (the whole sheet slot). */
const brokenSheetRaw = () => ({ styles: 'garbage' });

const initWithBroken = () =>
  useSnapshotStore.getState().initSnapshot({ sketch: brokenSheetBlob() as never, meta: { id: SNAP_ID } });

describe('sketch consent flow (T4)', () => {
  beforeEach(() => {
    localStorage.clear();
    useSketchConsentStore.setState({ dismissedKeys: [] });
    useSnapshotStore.setState((s) => {
      s.sketchDegraded = [];
      s.sketchQuarantine = {};
      s.meta.id = null;
    });
  });

  it('loading a broken blob degrades the resource + quarantines the raw slot', () => {
    initWithBroken();
    const s = useSnapshotStore.getState();
    expect(s.sketchDegraded).toHaveLength(1);
    expect(s.sketchDegraded[0].resource).toBe('base.character_sheet');
    expect(s.sketchQuarantine['base.character_sheet']).toEqual(brokenSheetRaw());
    // The typed tree holds the safe placeholder; healthy siblings loaded normally.
    expect(s.sketch.base.character_sheet).toEqual({ styles: [] });
    expect(s.sketch.characters).toEqual([{ key: 'kid', variants: [] }]);
  });

  it('accept() lifts the degraded state and persists ONLY an accept decision', () => {
    initWithBroken();
    const entry = useSnapshotStore.getState().sketchDegraded[0];
    useSketchConsentStore.getState().accept(['base.character_sheet']);

    const s = useSnapshotStore.getState();
    expect(s.sketchDegraded).toEqual([]);
    expect(s.sketchQuarantine).toEqual({});
    // D4: consent does NOT write to the DB — no dirty flag flips here.
    expect(s.sync.isDirty).toBe(false);

    const key = consentKey(SNAP_ID, 'base.character_sheet', entry.sig);
    expect(localStorage.getItem(key)).toBe('accept');
    // D11: 'refuse' is NEVER a stored value anywhere.
    for (let i = 0; i < localStorage.length; i++) {
      expect(localStorage.getItem(localStorage.key(i)!)).not.toBe('refuse');
    }
  });

  it('RELOAD after accept auto-applies the reset (no re-ask, resource ready)', () => {
    initWithBroken();
    useSketchConsentStore.getState().accept(['base.character_sheet']);
    // Simulate reload: same blob loads again in a fresh store state.
    initWithBroken();
    const s = useSnapshotStore.getState();
    expect(s.sketchDegraded).toEqual([]); // consented — applied silently
    expect(s.sketch.base.character_sheet).toEqual({ styles: [] });
  });

  it('dismiss() keeps the resource degraded (fail-safe) and only silences THIS session', () => {
    initWithBroken();
    const entry = useSnapshotStore.getState().sketchDegraded[0];
    useSketchConsentStore.getState().dismiss([dismissKeyOf(entry)]);

    expect(useSnapshotStore.getState().sketchDegraded).toHaveLength(1); // still degraded
    expect(useSketchConsentStore.getState().dismissedKeys).toContain(dismissKeyOf(entry));
    // Nothing persisted → a reload re-asks (D11).
    expect(localStorage.length).toBe(0);
  });

  it('RELOAD after refuse re-asks: degraded again, session dismissals gone', () => {
    initWithBroken();
    const entry = useSnapshotStore.getState().sketchDegraded[0];
    useSketchConsentStore.getState().dismiss([dismissKeyOf(entry)]);
    // Simulate reload: consent store resets (session-only), blob loads again.
    useSketchConsentStore.setState({ dismissedKeys: [] });
    initWithBroken();
    const s = useSnapshotStore.getState();
    expect(s.sketchDegraded).toHaveLength(1); // asks again — refuse was never persisted
  });

  it('a CHANGED blob (new sig) re-asks even after an accept of the old blob', () => {
    initWithBroken();
    useSketchConsentStore.getState().accept(['base.character_sheet']);
    // Same resource, different corrupted payload → different sig → decision no longer applies.
    const changed = {
      ...brokenSheetBlob(),
      base: { character_sheet: { styles: 12345 }, prop_sheet: { styles: [] } },
    };
    useSnapshotStore.getState().initSnapshot({ sketch: changed as never, meta: { id: SNAP_ID } });
    expect(useSnapshotStore.getState().sketchDegraded).toHaveLength(1);
  });

  it('accept() only touches the named resources (per-resource granularity)', () => {
    const blob = {
      ...brokenSheetBlob(),
      characters: 'also-garbage',
    };
    useSnapshotStore.getState().initSnapshot({ sketch: blob as never, meta: { id: SNAP_ID } });
    expect(useSnapshotStore.getState().sketchDegraded).toHaveLength(2);

    useSketchConsentStore.getState().accept(['characters']);
    const s = useSnapshotStore.getState();
    expect(s.sketchDegraded.map((d) => d.resource)).toEqual(['base.character_sheet']);
    expect(s.sketchQuarantine).toHaveProperty('base.character_sheet');
    expect(s.sketchQuarantine).not.toHaveProperty('characters');
  });

  it('reopen() clears session dismissals so the modal host re-derives open', () => {
    initWithBroken();
    const entry = useSnapshotStore.getState().sketchDegraded[0];
    useSketchConsentStore.getState().dismiss([dismissKeyOf(entry)]);
    useSketchConsentStore.getState().reopen();
    expect(useSketchConsentStore.getState().dismissedKeys).toEqual([]);
  });
});

describe('sketch-consent-storage', () => {
  beforeEach(() => localStorage.clear());

  it('sigOf is stable for equal content and differs for different content', () => {
    expect(sigOf({ a: 1, b: [2, 3] })).toBe(sigOf({ a: 1, b: [2, 3] }));
    expect(sigOf({ a: 1 })).not.toBe(sigOf({ a: 2 }));
    expect(sigOf(undefined)).toBe(sigOf(undefined)); // constant, never throws
  });

  it('readAccepted is false until writeAccepted, and keys are sig-scoped', () => {
    const key = consentKey('snap', 'base.character_sheet', 'abc');
    expect(readAccepted(key)).toBe(false);
    writeAccepted(key);
    expect(readAccepted(key)).toBe(true);
    expect(readAccepted(consentKey('snap', 'base.character_sheet', 'OTHER'))).toBe(false);
  });
});
