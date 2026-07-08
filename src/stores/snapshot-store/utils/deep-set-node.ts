// deep-set-node — PURE path-walk helpers for the collab content-sync merge (phase 04).
//
// Powers `applyRemoteNodePatch` / `reconcileCollectionByIds` on the snapshot store:
// walk a positional path (`state[column]` + `path[]`) then set / remove / read exactly
// ONE node. Kept pure (no immer, no store) so it is unit-testable in isolation — the
// high-risk part is writing to the WRONG path (silent clobber), hence the strict
// missing-intermediate / empty-path guards and the dedicated test file.
//
// Path semantics (matches the server-side positional path from `resolve_snapshot_path`):
//  - numeric-string segment ("0", "12") → array index
//  - any other segment → object key
// `value === null | undefined` → REMOVE the node (array splice / object delete);
// otherwise ASSIGN it. Intermediate that is absent (null/undefined) → no-op (never
// creates the path — a stale/legacy path stays a no-op, not a corruption).

/** Result of `setNodeAtPath` — discriminated so callers can log the no-op reason. */
export type SetNodeResult =
  | { ok: true; removed?: boolean }
  | { ok: false; reason: 'empty-path' | 'missing-intermediate' };

/** A path segment addresses an array index iff it is a run of digits ("0", "12"). */
export function isNumericKey(key: string): boolean {
  return /^\d+$/.test(key);
}

/** Coerce a path segment to its addressing form (number for array index, else string key). */
function toIndex(key: string): number | string {
  return isNumericKey(key) ? Number(key) : key;
}

/**
 * Set (or remove) the node at `path` under `root`, mutating `root` in place.
 *
 * `root` is expected to be a live reference (in the store it is an immer draft proxy —
 * mutating it directly is valid). Walks `path[0..n-2]` as intermediates; if any is
 * null/undefined it returns `missing-intermediate` WITHOUT creating the path. At the
 * final segment: `value == null` → remove (array splice / object delete), else assign.
 */
export function setNodeAtPath(
  root: unknown,
  path: string[],
  value: unknown,
): SetNodeResult {
  if (path.length === 0) return { ok: false, reason: 'empty-path' };

  // Walk intermediates only (path[0 .. n-2]); the last segment is the write target.
  let node: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (node == null) return { ok: false, reason: 'missing-intermediate' };
    const next = (node as Record<string | number, unknown>)[toIndex(path[i])];
    if (next == null) return { ok: false, reason: 'missing-intermediate' };
    node = next;
  }
  if (node == null) return { ok: false, reason: 'missing-intermediate' };

  const idx = toIndex(path[path.length - 1]);
  const parent = node as Record<string | number, unknown>;

  if (value === null || value === undefined) {
    // Remove: array + numeric index → splice (parent shrinks); else delete the key.
    if (Array.isArray(node) && typeof idx === 'number') {
      node.splice(idx, 1);
    } else {
      delete parent[idx];
    }
    return { ok: true, removed: true };
  }

  parent[idx] = value; // immer draft assign when called from the store
  return { ok: true };
}

/**
 * Read-only walk: returns the node at `path` under `root`, or `undefined` if any segment
 * (including the target) is absent. Used by `reconcileCollectionByIds` to read the local
 * array before merging. Empty path returns `root` itself.
 */
export function getNodeAtPath(root: unknown, path: string[]): unknown {
  let node: unknown = root;
  for (let i = 0; i < path.length; i++) {
    if (node == null) return undefined;
    node = (node as Record<string | number, unknown>)[toIndex(path[i])];
  }
  return node;
}
