// content-sync-store/types.ts — Contract for the realtime content-sync feature.
// Mirrors one `collaboration_activity_logs` INSERT row (the append-only change-feed)
// plus the `metadata.sync` envelope. `node`/`collection` scopes are injected by the
// gateway (server — only place with the positional path); `set` is injected
// client-direct on generate-summary. See phase-01 (read RPC) + phase-02 (enrich).

/** Snapshot JSONB column the sync targets. */
export type SnapshotColumn = 'sketch' | 'illustration' | 'characters' | 'props' | 'stages';

/** `metadata.sync` envelope — the three write-scopes a peer edit can produce:
 *  - `node`:       single addressed node changed (edit / create / upload).
 *  - `collection`: a whole collection at `path` changed order/membership
 *                  (reorder + delete) → refetch the parent, reconcile by id.
 *  - `set`:        one generate job replaced multiple targets at once. */
export type MetadataSync =
  | {
      scope: 'node';
      version: string;
      column: SnapshotColumn;
      path: string[];
      step: number;
      resource_type: number;
      resource_id: string;
      locale: string | null;
    }
  | {
      scope: 'collection';
      version: string;
      column: SnapshotColumn;
      path: string[];
      step: number;
      resource_type: number;
      resource_id: string;
      locale: string | null;
    }
  | {
      scope: 'set';
      version: string;
      targets: { column: SnapshotColumn; path: string[] }[];
    };

/** Raw `collaboration_activity_logs` row from the realtime INSERT payload
 *  (snake_case). `metadata.sync` is absent for non-content events (login/comment). */
export interface ActivityLogRawRow {
  id: string;
  book_id: string;
  actor_user_id: string;
  action_type: number; // 1-6 (crud audit)
  target_type: number | null;
  target_ref: unknown;
  metadata: { sync?: MetadataSync } | null;
  created_at: string;
}
