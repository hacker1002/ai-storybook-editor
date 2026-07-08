import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResourceLockStore } from './index';
import { useAllResourcesLockedByOther } from './selectors';
import type { LockEntry } from './types';

// Reactive-selector harness: seed bookId / myUserId / registry via setState (no channel),
// then renderHook the selector. Mirrors imperative-guards.test.ts (same store, imperative twin).

const BOOK = 'book1';
const ME = 'me';
const OTHER = 'other';

const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

function entry(holder: string, expires: string): LockEntry {
  return { holder_user_id: holder, acquired_at: past(), expires_at: expires };
}

function seed(pairs: Array<[string, LockEntry]>): void {
  useResourceLockStore.setState({ bookId: BOOK, myUserId: ME, registry: new Map(pairs) });
}

beforeEach(() => {
  useResourceLockStore.setState({ bookId: BOOK, myUserId: ME, registry: new Map() });
});

describe('useAllResourcesLockedByOther', () => {
  it('empty target list → false (nothing to gate)', () => {
    const { result } = renderHook(() => useAllResourcesLockedByOther(3, []));
    expect(result.current).toBe(false);
  });

  it('single free target → false', () => {
    const { result } = renderHook(() => useAllResourcesLockedByOther(3, ['kid_hero']));
    expect(result.current).toBe(false);
  });

  it('single target locked by another editor → true (Generate must disable)', () => {
    seed([[`${BOOK}|1|3|kid_hero|`, entry(OTHER, future())]]);
    const { result } = renderHook(() => useAllResourcesLockedByOther(3, ['kid_hero']));
    expect(result.current).toBe(true);
  });

  it('single target locked by ME → false (my own held lock never gates)', () => {
    seed([[`${BOOK}|1|3|kid_hero|`, entry(ME, future())]]);
    const { result } = renderHook(() => useAllResourcesLockedByOther(3, ['kid_hero']));
    expect(result.current).toBe(false);
  });

  it('expired lock → false (prune-aware expiry)', () => {
    seed([[`${BOOK}|1|3|kid_hero|`, entry(OTHER, past())]]);
    const { result } = renderHook(() => useAllResourcesLockedByOther(3, ['kid_hero']));
    expect(result.current).toBe(false);
  });

  it('mixed batch — one free, one locked-by-other → false (job skips the locked one, runs the rest)', () => {
    seed([[`${BOOK}|1|3|villain|`, entry(OTHER, future())]]);
    const { result } = renderHook(() => useAllResourcesLockedByOther(3, ['kid_hero', 'villain']));
    expect(result.current).toBe(false);
  });

  it('every target locked by other → true', () => {
    seed([
      [`${BOOK}|1|3|kid_hero|`, entry(OTHER, future())],
      [`${BOOK}|1|3|villain|`, entry(OTHER, future())],
    ]);
    const { result } = renderHook(() => useAllResourcesLockedByOther(3, ['kid_hero', 'villain']));
    expect(result.current).toBe(true);
  });

  it('resource_type is scoped — a prop lock (4) does not gate a character (3) target', () => {
    seed([[`${BOOK}|1|4|kid_hero|`, entry(OTHER, future())]]);
    const { result } = renderHook(() => useAllResourcesLockedByOther(3, ['kid_hero']));
    expect(result.current).toBe(false);
  });

  it('no book connected → false', () => {
    useResourceLockStore.setState({ bookId: null });
    const { result } = renderHook(() => useAllResourcesLockedByOther(3, ['kid_hero']));
    expect(result.current).toBe(false);
  });
});
