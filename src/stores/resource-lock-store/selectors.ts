// resource-lock-store/selectors.ts — Reactive read-side hooks for grey-out UX.
//
// EVERY selector returns a PRIMITIVE (boolean | string | null). Returning a Map /
// object / freshly-.map()-ed array here would loop forever under zustand's default
// Object.is compare (memory feedback_zustand_useshallow_nested_arrays). The 15s
// prune tick mutates `registry`, forcing a re-run so an expired lock flips back to
// editable without a realtime event.

import { keyOf, FALLBACK_HOLDER_NAME, type LockTarget, type ResourceType } from './types';
import { useResourceLockStore, type ResourceLockState } from './index';

/** Is a live lock on `target` held by SOMEONE ELSE (not me, not expired)? */
export function useIsLockedByOther(target: LockTarget): boolean {
  return useResourceLockStore((s: ResourceLockState) => {
    if (!s.bookId) return false;
    const entry = s.registry.get(keyOf(s.bookId, target));
    if (!entry) return false;
    if (entry.holder_user_id === s.myUserId) return false;
    return new Date(entry.expires_at).getTime() > Date.now();
  });
}

/** Display name of the OTHER holder for a tooltip; null when free / mine / expired. */
export function useLockHolderName(target: LockTarget): string | null {
  return useResourceLockStore((s: ResourceLockState) => {
    if (!s.bookId) return null;
    const entry = s.registry.get(keyOf(s.bookId, target));
    if (!entry) return null;
    if (entry.holder_user_id === s.myUserId) return null;
    if (new Date(entry.expires_at).getTime() <= Date.now()) return null;
    return s.holderNames.get(entry.holder_user_id) ?? FALLBACK_HOLDER_NAME;
  });
}

/** Spread row (sidebar) grey-out: true if the spread's structural lock (type 6)
 *  OR any of its child image locks (type 1) is held by another editor.
 *  Returns a boolean → stable under Object.is even when `childImageIds` is a fresh
 *  array each render. */
export function useIsSpreadLockedByOther(spreadId: string, childImageIds: string[]): boolean {
  return useResourceLockStore((s: ResourceLockState) => {
    const bookId = s.bookId;
    if (!bookId) return false;
    const me = s.myUserId;
    const now = Date.now();
    const heldByOther = (key: string): boolean => {
      const e = s.registry.get(key);
      return !!e && e.holder_user_id !== me && new Date(e.expires_at).getTime() > now;
    };
    // step=1, locale='' (null) for spread/image keys.
    if (heldByOther(`${bookId}|1|6|${spreadId}|`)) return true;
    for (const imageId of childImageIds) {
      if (heldByOther(`${bookId}|1|1|${imageId}|`)) return true;
    }
    return false;
  });
}

/** Generate-gate for the sketch entity content-area: true when EVERY `resourceId`
 *  of `resourceType` (3 character · 4 prop · 5 stage, locale null) is locked by
 *  another editor — i.e. the whole batch would be skipped by the generate job, so the
 *  Generate button must be disabled. Any free target ⇒ false (the job skips the locked
 *  ones and still generates the rest). Empty `resourceIds` ⇒ false (nothing to gate).
 *  Returns a boolean → Object.is-stable even though `resourceIds` is a fresh array each
 *  render (see file header). */
export function useAllResourcesLockedByOther(
  resourceType: ResourceType,
  resourceIds: string[],
): boolean {
  return useResourceLockStore((s: ResourceLockState) => {
    const bookId = s.bookId;
    if (!bookId || resourceIds.length === 0) return false;
    const me = s.myUserId;
    const now = Date.now();
    for (const id of resourceIds) {
      const e = s.registry.get(`${bookId}|1|${resourceType}|${id}|`);
      const lockedByOther = !!e && e.holder_user_id !== me && new Date(e.expires_at).getTime() > now;
      if (!lockedByOther) return false; // ≥1 free target → batch can still run
    }
    return true;
  });
}
