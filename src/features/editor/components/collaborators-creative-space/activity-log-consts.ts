// activity-log-consts — shared types + mapping constants for the collaborator
// activity-log tab. Maps 1:1 to `collaboration_activity_logs` (DATABASE-SCHEMA.md
// §collaboration_activity_logs): append-only audit rows, newest-first.
//
// The stored row carries only NUMERIC enums + a raw `target_ref` JSONB — the human
// message is rendered CLIENT-side from `(action_type + target_ref)` (schema never
// stores a localized string). `resolveActivityVerb` is the single seam an i18n sprint
// swaps for real `t('activity.<key>')`; today it returns the English literal (and,
// per spec, falls back to the raw key rather than crashing on an unknown action).

import { LogIn, Plus, FileText, Trash2, UploadCloud, MessageSquare, type LucideIcon } from 'lucide-react';

/** One persisted audit row (verbatim column names from DATABASE-SCHEMA §collaboration_activity_logs). */
export interface ActivityLog {
  id: string;
  book_id: string;
  actor_user_id: string; // FK → auth.users — the actor (owner or collaborator)
  action_type: number; // 1 login, 2 create, 3 edit, 4 delete, 5 upload, 6 comment
  target_type: number | null; // 1 spread, 2 asset, 3 object, 4 entity, 5 book
  target_ref: Record<string, unknown> | null; // {spread_number:4} / {asset:'hero.png'} / {object:'Dragon'}
  metadata: Record<string, unknown> | null; // before/after for permission/status change
  created_at: string;
}

/** Time-range filter (single-select). */
export type TimeRange = 'all' | '24h' | '7d' | '30d';

/**
 * action_type → display metadata. `verb` is the English fallback used until i18n
 * lands; `Icon` is the lucide component rendered in the row (design §03 2.2 — enum
 * follows the DB: no "View", but create + delete present).
 */
export const ACTION_META: Record<number, { key: string; label: string; verb: string; Icon: LucideIcon }> = {
  1: { key: 'login', label: 'Login', verb: 'Logged in', Icon: LogIn },
  2: { key: 'create', label: 'Create', verb: 'Created', Icon: Plus },
  3: { key: 'edit', label: 'Edit', verb: 'Edited', Icon: FileText },
  4: { key: 'delete', label: 'Delete', verb: 'Deleted', Icon: Trash2 },
  5: { key: 'upload', label: 'Upload', verb: 'Uploaded', Icon: UploadCloud },
  6: { key: 'comment', label: 'Comment', verb: 'Commented on', Icon: MessageSquare },
};

/** Ordered action options for the type filter (excludes "View" — not persistable). */
export const ACTION_OPTIONS: { value: number; label: string }[] = Object.entries(ACTION_META).map(([value, meta]) => ({
  value: Number(value),
  label: meta.label,
}));

/** Time-range options for the time filter (single-select). */
export const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

/**
 * target_type → human target label from `target_ref` (design §03 2.2). Optional
 * chaining + `String(... ?? '?')` keeps a malformed/missing ref from throwing.
 */
export const TARGET_LABELERS: Record<number, (ref: Record<string, unknown> | null) => string> = {
  1: (r) => `spread #${String(r?.spread_number ?? '?')}`,
  2: (r) => `asset ${String(r?.asset ?? '')}`.trim(),
  3: (r) => `object: ${String(r?.object ?? '')}`.trim(),
  4: (r) => `entity ${String(r?.entity ?? '')}`.trim(),
  5: () => 'book',
};

/**
 * Resolve the action verb. i18n seam: today returns the English literal; when i18n
 * arrives, replace the body with `t('activity.' + key, { defaultValue: fallback })`.
 * On an unknown key, return the fallback (never crash / show a broken key).
 */
export function resolveActivityVerb(_key: string, fallback: string): string {
  return fallback;
}

/**
 * Build the display message from `(action_type + target_ref)`. `login` (and any
 * target-less action) renders the verb only ("Logged in"); others append the target
 * ("Edited spread #4"). An unknown action_type degrades to a generic literal.
 */
export function activityMessage(log: ActivityLog): string {
  const meta = ACTION_META[log.action_type];
  const verb = meta ? resolveActivityVerb(meta.key, meta.verb) : `Action ${log.action_type}`;
  const target = log.target_type != null ? TARGET_LABELERS[log.target_type]?.(log.target_ref) ?? '' : '';
  return target ? `${verb} ${target}` : verb;
}

/** Absolute timestamp `YYYY/MM/DD HH:MM:SS` (local time; audit needs exactness, not relative). */
export function formatLogTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // never crash on a bad value
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Lower bound (ISO) for a time range, or null for 'all' (no created_at filter). */
export function timeRangeSince(range: TimeRange): string | null {
  if (range === 'all') return null;
  const DAY_MS = 86_400_000;
  const spanMs = range === '24h' ? DAY_MS : range === '7d' ? 7 * DAY_MS : 30 * DAY_MS;
  return new Date(Date.now() - spanMs).toISOString();
}
