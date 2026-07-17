// resource-lock-store/write-blocker.ts — LEAF registry for the degraded-sketch save-block
// (ADR-047 phase-04). Dependency inversion keeps resource-lock-store a leaf store: it must NOT
// import snapshot-store (slice ↔ store cycle), so snapshot-store PUSHES a predicate down here
// once at module init; the predicate reads the live `sketchDegraded` state on every call.
//
// Imported by BOTH resource-lock-store (guards on save/releaseAndSave) and resource-lock-api
// (guard on the reorder bypass path) — the store imports the api, so the shared seam must live
// outside both to stay acyclic.
//
// DATA-SAFETY guard, NOT a security boundary: the gateway (lock precondition + access_rights)
// remains the authority on who may write. This only stops a client that KNOWS its in-memory
// subtree is a placeholder from persisting that placeholder without user consent.

import type { LockTarget } from './types';

let blocker: ((t: LockTarget) => boolean) | null = null;

/** Install (or clear with null) the degraded-write predicate. Called once by snapshot-store at
 *  module init — the predicate itself reads live state, so it never needs re-installing. */
export function setSketchWriteBlocker(fn: ((t: LockTarget) => boolean) | null): void {
  blocker = fn;
}

/** True when a write to `t` must be refused (degraded subtree, consent pending). A THROWING
 *  predicate blocks (fail-safe, never fail-open). */
export function isSketchWriteBlocked(t: LockTarget): boolean {
  if (!blocker) return false;
  try {
    return blocker(t);
  } catch {
    return true;
  }
}
