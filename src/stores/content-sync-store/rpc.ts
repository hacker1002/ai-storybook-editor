// content-sync-store/rpc.ts — Targeted per-node read client. First `.rpc(` in the
// codebase: reads bypass the write-gateway (ADR-043 gateway = WRITE-only) and go
// straight through supabase-js under the user JWT. `get_snapshot_node` is SECURITY
// INVOKER → it inherits the `snapshots` RLS, so no access is re-implemented here.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { SnapshotColumn } from './types';

const log = createLogger('Store', 'ContentSyncRpc');

/**
 * Fetch a single snapshot node via `get_snapshot_node(p_version_id, p_column, p_path)`.
 *
 * The return value is 3-way and load-bearing (R3 — never conflate the two nulls):
 *   - the jsonb node        → present, caller merges it in.
 *   - `null`                → node/version does NOT exist (deleted) → phase-05 merge = remove.
 *   - `undefined`           → the RPC itself ERRORED → phase-05 SKIP, do NOT merge.
 */
export async function fetchSnapshotNode(
  version: string,
  column: SnapshotColumn,
  path: string[],
): Promise<unknown> {
  const { data, error } = await supabase.rpc('get_snapshot_node', {
    p_version_id: version,
    p_column: column,
    p_path: path,
  });
  if (error) {
    log.warn('fetchSnapshotNode', 'rpc failed', { column, error: error.message });
    return undefined; // RPC error → skip (distinct from a `null` deleted node)
  }
  return data; // jsonb node, or null when the node/version is gone
}
