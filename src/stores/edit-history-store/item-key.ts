// edit-history-store/item-key.ts — ItemKey build/parse + resolve an ItemKey to a live
// snapshot-store address (column + positional path) and to its captured sub-tree.
//
// Grain (ADR-045) — the array INDEX is resolved fresh from the passed live state every call
// (robust to a mid-session reorder; no stale idx captured in a closure):
//   illustration-scene (rtype 6)  → column 'illustration', path ['spreads', idx], SCENE_OWNED_KEYS projection
//   retouch            (rtype 10) → column 'illustration', path ['spreads', idx], RETOUCH_OWNED_KEYS projection
//   illustration-entity(3|4|5)    → column characters|props|stages, path [idx], WHOLE node
// The subtree grain matches the held session's baseline projection (extractOwnedSubtree vs
// whole node) so captured snapshots + the baseline are the same shape.

import {
  SCENE_OWNED_KEYS,
  RETOUCH_OWNED_KEYS,
  extractOwnedSubtree,
} from '@/stores/snapshot-store/slices/collab-owned-subtree';
import { getNodeAtPath } from '@/stores/snapshot-store/utils/deep-set-node';
import type { SnapshotStore, SnapshotColumn } from '@/stores/snapshot-store/types';
import type { LockTarget } from '@/stores/resource-lock-store';
import type { EditHistoryDomain, ItemKey } from './types';

/** Sentinel used in the key for a language-agnostic resource (locale == null). */
export const NO_LOCALE = '∅';

/** rtype → entity column (for the WHOLE-node entity grain). */
const ENTITY_COLUMN_BY_RTYPE: Record<number, Extract<SnapshotColumn, 'characters' | 'props' | 'stages'>> = {
  3: 'characters',
  4: 'props',
  5: 'stages',
};

/** Build the ItemKey for a held-session target — `${domain}:${rtype}:${rid}:${locale|∅}`. */
export function buildItemKey(domain: EditHistoryDomain, target: LockTarget): ItemKey {
  return `${domain}:${target.resource_type}:${target.resource_id}:${target.locale ?? NO_LOCALE}` as ItemKey;
}

export interface ParsedItemKey {
  domain: EditHistoryDomain;
  resourceType: number;
  resourceId: string;
  locale: string | null;
}

/** Parse an ItemKey back to its parts. Returns null on a malformed key. */
export function parseItemKey(key: string): ParsedItemKey | null {
  const parts = key.split(':');
  if (parts.length !== 4) return null;
  const [domain, rtypeRaw, resourceId, localeRaw] = parts;
  const resourceType = Number(rtypeRaw);
  if (!Number.isFinite(resourceType) || !resourceId) return null;
  return {
    domain: domain as EditHistoryDomain,
    resourceType,
    resourceId,
    locale: localeRaw === NO_LOCALE ? null : localeRaw,
  };
}

/** A resolved live snapshot-store address for an ItemKey. */
export interface ItemAddress {
  column: SnapshotColumn;
  /** Positional path (numeric-string index resolved from the passed state). */
  path: string[];
  /** 'subtree' = owned-key MERGE grain (scene/retouch); 'node' = WHOLE-node replace (entity). */
  grain: 'subtree' | 'node';
  /** Owned keys for the 'subtree' grain (undefined for 'node'). */
  ownedKeys?: readonly string[];
}

/** Resolve an ItemKey to its live address, resolving the array index from `state`.
 *  Returns null when the domain is unsupported (sketch) or the resource is gone. */
export function resolveItemAddress(state: SnapshotStore, key: string): ItemAddress | null {
  const parsed = parseItemKey(key);
  if (!parsed) return null;
  const { domain, resourceType, resourceId } = parsed;

  if (domain === 'illustration-scene' || domain === 'retouch') {
    const idx = state.illustration.spreads.findIndex((sp) => sp.id === resourceId);
    if (idx < 0) return null;
    return {
      column: 'illustration',
      path: ['spreads', String(idx)],
      grain: 'subtree',
      ownedKeys: domain === 'illustration-scene' ? SCENE_OWNED_KEYS : RETOUCH_OWNED_KEYS,
    };
  }

  if (domain === 'illustration-entity') {
    const column = ENTITY_COLUMN_BY_RTYPE[resourceType];
    if (!column) return null;
    const arr = state[column] as Array<{ key?: string }> | undefined;
    const idx = arr?.findIndex((e) => e.key === resourceId) ?? -1;
    if (idx < 0) return null;
    return { column, path: [String(idx)], grain: 'node' };
  }

  // sketch — reserved (per-item sketch undo is a later phase).
  return null;
}

/** Select the CAPTURED sub-tree for an ItemKey from live state — the owned-key projection
 *  (scene/retouch) or the whole node (entity). Returns a FRESH object for the subtree grain
 *  (safe: only consumed by the capture SUBSCRIPTION with a dequal equalityFn, never in a React
 *  render selector — so the useShallow fresh-object footgun does not apply). */
export function selectItemSubtree(state: SnapshotStore, key: string): unknown {
  const addr = resolveItemAddress(state, key);
  if (!addr) return undefined;
  const node = getNodeAtPath((state as unknown as Record<string, unknown>)[addr.column], addr.path);
  if (addr.grain === 'subtree' && addr.ownedKeys) {
    return extractOwnedSubtree(node, addr.ownedKeys);
  }
  return node;
}
