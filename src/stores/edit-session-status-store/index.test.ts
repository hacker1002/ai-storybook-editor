// edit-session-status-store.test.ts — the single-sourced collab header status (ADR-044/045).
// Covers the two ref-counts (mountCount via enter/leave, holdCount via beginHold/endHold), the
// save-phase transitions, and the teardown-order race that motivated the leave()-resets-at-0 guard.
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditSessionStatusStore } from './index';

const get = () => useEditSessionStatusStore.getState();

beforeEach(() => {
  useEditSessionStatusStore.setState({ mountCount: 0, holdCount: 0, savePhase: 'idle', commitFn: null });
});

describe('mountCount (enter/leave)', () => {
  it('ref-counts and floors at 0', () => {
    get().enter();
    get().enter();
    expect(get().mountCount).toBe(2);
    get().leave();
    expect(get().mountCount).toBe(1);
    get().leave();
    get().leave(); // extra leave must not go negative
    expect(get().mountCount).toBe(0);
  });

  it('resets hold + phase when the last space leaves', () => {
    get().enter();
    get().beginHold();
    get().markSaving();
    expect(get().holdCount).toBe(1);
    expect(get().savePhase).toBe('saving');
    get().leave(); // mountCount → 0
    expect(get().holdCount).toBe(0);
    expect(get().savePhase).toBe('idle');
  });

  it('does NOT reset hold/phase while another space is still mounted', () => {
    get().enter();
    get().enter();
    get().beginHold();
    get().markSaving();
    get().leave(); // mountCount 2 → 1, still active
    expect(get().holdCount).toBe(1);
    expect(get().savePhase).toBe('saving');
  });
});

describe('holdCount (beginHold/endHold)', () => {
  it('ref-counts and floors at 0', () => {
    get().beginHold();
    expect(get().holdCount).toBe(1);
    get().endHold();
    get().endHold(); // extra endHold must not go negative
    expect(get().holdCount).toBe(0);
  });

  it('beginHold clears a stale terminal save phase', () => {
    get().markSaved();
    expect(get().savePhase).toBe('saved');
    get().beginHold();
    expect(get().savePhase).toBe('idle'); // fresh hold → header "Unsaved", not lingering "Saved"
  });
});

describe('save phase', () => {
  it('markSaving → saving, markSaved → saved', () => {
    get().markSaving();
    expect(get().savePhase).toBe('saving');
    get().markSaved();
    expect(get().savePhase).toBe('saved');
  });
});

describe('teardown-order race (leave before a late lock endHold)', () => {
  it('leave() resetting to 0 + endHold() floor keeps holdCount at 0 (no stale Unsaved, no negative)', () => {
    get().enter();
    get().beginHold();
    // Simulate the documented sibling-cleanup order: useCollabPersistSession.leave() runs FIRST
    // (mountCount → 0, hard-reset), THEN the lock hook's cleanup fires endHold().
    get().leave();
    expect(get().holdCount).toBe(0);
    get().endHold(); // late decrement — floored, cannot underflow
    expect(get().holdCount).toBe(0);
    expect(get().savePhase).toBe('idle');
  });
});

describe('commit registry', () => {
  it('registers and clears only its own callback (guarded)', () => {
    const a = () => {};
    const b = () => {};
    get().registerCommit(a);
    expect(get().commitFn).toBe(a);
    get().clearCommit(b); // a late cleanup for a DIFFERENT fn must not clobber the current one
    expect(get().commitFn).toBe(a);
    get().clearCommit(a);
    expect(get().commitFn).toBeNull();
  });
});
