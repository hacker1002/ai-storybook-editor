// resource-lock-store/imperative-guards.ts — IMPERATIVE (non-hook) registry scans
// for CLICK-TIME structural-op guards.
//
// Unlike selectors.ts (reactive hooks that MUST return a primitive), these read
// `useResourceLockStore.getState()` once at call time. A multi-key registry scan
// belongs here — NOT in a render-time selector (memory: the child-lock guard is
// imperative, run inside the click handler).

import { keyOf, type LockTarget, type LockEntry } from './types';
import { useResourceLockStore } from './index';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'ResourceLockGuards');

/** True when `entry` is a LIVE lock held by SOMEONE ELSE (not me, not expired). */
function heldByOther(entry: LockEntry | undefined, me: string | null, now: number): boolean {
  return !!entry && entry.holder_user_id !== me && new Date(entry.expires_at).getTime() > now;
}

/** True when `entry` is a LIVE lock held by ME (not expired). Inverse of
 *  `heldByOther` — powers the content-sync lock-skip (never clobber a node I'm
 *  actively editing). */
function heldByMe(entry: LockEntry | undefined, me: string | null, now: number): boolean {
  return !!entry && !!me && entry.holder_user_id === me && new Date(entry.expires_at).getTime() > now;
}

/**
 * Do I currently hold a LIVE lock on this exact target? Imperative + expiry-aware
 * (mirror of `isLockedByOtherNow`, inverted). Used by the content-sync handler
 * (phase 05) to skip merging a remote `node` patch onto a node I'm mid-edit on.
 */
export function holdsLiveLock(target: LockTarget): boolean {
  const s = useResourceLockStore.getState();
  if (!s.bookId) return false;
  return heldByMe(s.registry.get(keyOf(s.bookId, target)), s.myUserId, Date.now());
}

/**
 * Do I hold ANY live lock in this book right now? Imperative + expiry-aware. Used
 * by the content-sync `set`-scope skip (whole-replace generate output is coarse →
 * skip if I'm editing anything, phase 05 v1).
 */
export function hasAnyLiveLock(): boolean {
  const s = useResourceLockStore.getState();
  const me = s.myUserId;
  if (!me) return false;
  const now = Date.now();
  for (const entry of s.registry.values()) {
    if (heldByMe(entry, me, now)) return true;
  }
  return false;
}

/**
 * Delete-spread child-lock guard (SRS §4.5). The spread's type-6 STRUCTURAL lock is
 * a DIFFERENT registry key than its CONTENT locks (type 1 image / type 2 textbox),
 * so a structural delete must EXPLICITLY check every child node — else it could
 * clobber another editor's in-flight image/textbox edit.
 *
 * The `useIsSpreadLockedByOther` selector only covers the spread lock + child IMAGE
 * locks; TEXTBOX locks are locale-scoped (`{2, textboxId, locale}`) and the locale
 * suffix is not enumerable a priori, so they are prefix-scanned here.
 *
 * @returns true if the spread OR any child (image OR textbox, ANY locale) is held by
 *          another live editor.
 */
export function isSpreadStructurallyLockedByOther(
  spreadId: string,
  childImageIds: string[],
  childTextboxIds: string[],
): boolean {
  const s = useResourceLockStore.getState();
  const bookId = s.bookId;
  if (!bookId) return false;
  const me = s.myUserId;
  const now = Date.now();

  // Spread structural lock (type 6) + each child image lock (type 1) — EXACT keys
  // (locale is null → trailing '' suffix, matches `keyOf`).
  if (heldByOther(s.registry.get(`${bookId}|1|6|${spreadId}|`), me, now)) {
    log.debug('isSpreadStructurallyLockedByOther', 'spread lock held by other', { spreadId });
    return true;
  }
  for (const imageId of childImageIds) {
    if (heldByOther(s.registry.get(`${bookId}|1|1|${imageId}|`), me, now)) {
      log.debug('isSpreadStructurallyLockedByOther', 'child image lock held by other', {
        spreadId,
        imageId,
      });
      return true;
    }
  }

  // Textbox locks (type 2) — locale-scoped, so prefix-scan the registry for any
  // held-by-other key whose resource_id is one of ours. Textbox ids are UUIDs, so
  // the `${bookId}|1|2|${tid}|` prefix (trailing '|') can't false-match a sibling.
  if (childTextboxIds.length > 0) {
    const prefixes = childTextboxIds.map((tid) => `${bookId}|1|2|${tid}|`);
    for (const [key, entry] of s.registry) {
      if (!heldByOther(entry, me, now)) continue;
      if (prefixes.some((p) => key.startsWith(p))) {
        log.debug('isSpreadStructurallyLockedByOther', 'child textbox lock held by other', {
          spreadId,
        });
        return true;
      }
    }
  }
  return false;
}

/**
 * Imperative counterpart of the `useIsLockedByOther` selector — a single-key
 * click-time check for the entity delete guard (the row is already greyed via the
 * reactive hook; this re-checks at click time to close the render→click TOCTOU).
 */
export function isLockedByOtherNow(target: LockTarget): boolean {
  const s = useResourceLockStore.getState();
  if (!s.bookId) return false;
  return heldByOther(s.registry.get(keyOf(s.bookId, target)), s.myUserId, Date.now());
}
