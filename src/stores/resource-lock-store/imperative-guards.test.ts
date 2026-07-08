import { describe, it, expect, beforeEach } from 'vitest';
import { useResourceLockStore } from './index';
import { isSpreadStructurallyLockedByOther, isLockedByOtherNow } from './imperative-guards';
import type { LockEntry, LockTarget } from './types';

// Direct-state harness: the guards read `useResourceLockStore.getState()` at call time,
// so a test seeds `bookId` / `myUserId` / `registry` via setState (no channel needed).

const BOOK = 'book1';
const ME = 'me';
const OTHER = 'other';

const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

function entry(holder: string, expires: string): LockEntry {
  return { holder_user_id: holder, acquired_at: past(), expires_at: expires };
}

/** Seed the registry from `[key, entry]` pairs and the identity fields. */
function seed(pairs: Array<[string, LockEntry]>): void {
  useResourceLockStore.setState({
    bookId: BOOK,
    myUserId: ME,
    registry: new Map(pairs),
  });
}

beforeEach(() => {
  useResourceLockStore.setState({ bookId: BOOK, myUserId: ME, registry: new Map() });
});

describe('isSpreadStructurallyLockedByOther', () => {
  it('free spread with no locks → false', () => {
    expect(isSpreadStructurallyLockedByOther('sp1', ['img1'], ['tb1'])).toBe(false);
  });

  it('spread type-6 lock held by another editor → true', () => {
    seed([[`${BOOK}|1|6|sp1|`, entry(OTHER, future())]]);
    expect(isSpreadStructurallyLockedByOther('sp1', [], [])).toBe(true);
  });

  it('spread type-6 lock held by ME → false', () => {
    seed([[`${BOOK}|1|6|sp1|`, entry(ME, future())]]);
    expect(isSpreadStructurallyLockedByOther('sp1', [], [])).toBe(false);
  });

  it('child IMAGE lock (type 1) held by other → true', () => {
    seed([[`${BOOK}|1|1|img1|`, entry(OTHER, future())]]);
    expect(isSpreadStructurallyLockedByOther('sp1', ['img1'], [])).toBe(true);
  });

  it('child image lock for an image NOT in the spread → false', () => {
    seed([[`${BOOK}|1|1|imgX|`, entry(OTHER, future())]]);
    expect(isSpreadStructurallyLockedByOther('sp1', ['img1'], [])).toBe(false);
  });

  it('child TEXTBOX lock (type 2, any locale) held by other → true (locale-scoped prefix scan)', () => {
    seed([[`${BOOK}|1|2|tb1|vi`, entry(OTHER, future())]]);
    expect(isSpreadStructurallyLockedByOther('sp1', [], ['tb1'])).toBe(true);
  });

  it('textbox lock for a textbox NOT in the spread → false (prefix cannot false-match)', () => {
    seed([[`${BOOK}|1|2|tbX|vi`, entry(OTHER, future())]]);
    expect(isSpreadStructurallyLockedByOther('sp1', [], ['tb1'])).toBe(false);
  });

  it('expired lock → false', () => {
    seed([[`${BOOK}|1|6|sp1|`, entry(OTHER, past())]]);
    expect(isSpreadStructurallyLockedByOther('sp1', [], [])).toBe(false);
  });

  it('no book connected → false', () => {
    useResourceLockStore.setState({ bookId: null });
    expect(isSpreadStructurallyLockedByOther('sp1', ['img1'], ['tb1'])).toBe(false);
  });
});

describe('isLockedByOtherNow', () => {
  const target: LockTarget = { step: 1, resource_type: 3, resource_id: 'kid_hero', locale: null };

  it('entity lock held by other → true', () => {
    seed([[`${BOOK}|1|3|kid_hero|`, entry(OTHER, future())]]);
    expect(isLockedByOtherNow(target)).toBe(true);
  });

  it('entity lock held by me → false', () => {
    seed([[`${BOOK}|1|3|kid_hero|`, entry(ME, future())]]);
    expect(isLockedByOtherNow(target)).toBe(false);
  });

  it('no lock → false', () => {
    expect(isLockedByOtherNow(target)).toBe(false);
  });

  it('expired lock → false', () => {
    seed([[`${BOOK}|1|3|kid_hero|`, entry(OTHER, past())]]);
    expect(isLockedByOtherNow(target)).toBe(false);
  });
});
