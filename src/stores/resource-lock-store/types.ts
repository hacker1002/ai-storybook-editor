// resource-lock-store/types.ts — Shared vocabulary for the collaborator edit-lock
// feature. Mirrors the `resource_locks` table + the `resource/*` gateway contract
// (see ai-storybook-design/api/resource, component/stores/resource-lock-store.md).

/** Workflow step. Phase-02 scope = sketch only (gateway enum also allows 2/3). */
export type Step = 1;

/** Resource kind inside a snapshot.
 *  1 image · 2 textbox · 3 character · 4 prop · 5 stage · 6 spread. */
export type ResourceType = 1 | 2 | 3 | 4 | 5 | 6;

/** Addresses one lockable resource. `locale` is set for textboxes (per-language)
 *  and null for language-agnostic resources (image / entity / spread). */
export interface LockTarget {
  step: Step;
  resource_type: ResourceType;
  resource_id: string;
  locale: string | null;
}

/** A live lock as seen in the registry (from realtime / seed SELECT). */
export interface LockEntry {
  holder_user_id: string;
  acquired_at: string;
  expires_at: string; // ISO — pruned once < now()
}

/** Save payload — caller maps a snapshot node to this (see gateway save spec §6). */
export interface SavePayload {
  /** crud audit: 2 create · 3 edit · 4 delete · 5 upload (generate). */
  action_type: 2 | 3 | 4 | 5;
  /** New value of the addressed node (shape depends on resource_type). */
  patch: unknown;
  /** Audit ref, e.g. { spread_number, page, textbox_id, locale, kind, entity }. */
  target_ref?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** default true; false = patch-only (generate per-target — audit summarized per job). */
  log?: boolean;
}

/** Lifecycle status of a single lock session (consumed by phase-03 hook). */
export type SessionStatus = 'idle' | 'acquiring' | 'held' | 'blocked' | 'releasing' | 'lost';

/** Raw `resource_locks` row (snake_case) from the seed SELECT + realtime payload.
 *  DELETE payloads carry the full old row thanks to REPLICA IDENTITY FULL. */
export interface ResourceLockRawRow {
  book_id: string;
  step: number;
  resource_type: number;
  resource_id: string;
  locale: string | null;
  holder_user_id: string;
  acquired_at: string;
  expires_at: string;
}

/** Tooltip fallback when a holder's profile name is unresolved. */
export const FALLBACK_HOLDER_NAME = 'another editor';

/** Registry key = `${book_id}|${step}|${resource_type}|${resource_id}|${locale ?? ''}`.
 *  Matches the DB UNIQUE constraint (NULLS NOT DISTINCT → NULL locale ≡ ''). */
export function keyOf(bookId: string, t: LockTarget): string {
  return `${bookId}|${t.step}|${t.resource_type}|${t.resource_id}|${t.locale ?? ''}`;
}

/** Registry key derived from a raw row (same format as `keyOf`). */
export function rowKey(row: ResourceLockRawRow): string {
  return `${row.book_id}|${row.step}|${row.resource_type}|${row.resource_id}|${row.locale ?? ''}`;
}

/** Project a raw row to the registry entry shape. */
export function rowToEntry(row: ResourceLockRawRow): LockEntry {
  return {
    holder_user_id: row.holder_user_id,
    acquired_at: row.acquired_at,
    expires_at: row.expires_at,
  };
}
