// edit-history-store/types.ts — vocabulary for the in-memory, session-scoped undo/redo
// store (ADR-045). Undo/redo lives ONLY inside an edit-lock HELD window: begin/endSession
// tie 1:1 to the per-spread / per-entity held sessions (use-held-resource-session). Each
// tracked item snapshots its WHOLE sub-tree (scene/retouch = owned-key projection; entity =
// whole node) so an undo restores the version-stack + is_selected in one write.
//
// NOT persisted — reload / logout / book-change lose all (KISS; the held-session save is the
// only durable write path). No cross-item / cross-spread undo (out of scope, ADR-045).

/** The four grain domains. `sketch` is RESERVED (per-item sketch nexus is a later phase). */
export type EditHistoryDomain =
  | 'illustration-scene' // rtype 6  → illustration.spreads[idx] ∩ SCENE_OWNED_KEYS
  | 'retouch' //           rtype 10 → illustration.spreads[idx] ∩ RETOUCH_OWNED_KEYS
  | 'illustration-entity' // rtype 3|4|5 → characters|props|stages[idx] (WHOLE node)
  | 'sketch'; // reserved — not wired this phase

/** `${domain}:${resourceType}:${resourceId}:${locale | '∅'}` — one tracked item. */
export type ItemKey = `${string}:${number}:${string}:${string}`;

/** Ring-buffer cap on the past stack (oldest dropped past this). */
export const MAX_HISTORY = 50;
/** Trailing-debounce window: coalesces a rapid gesture into ONE undo step. */
export const SETTLE_MS = 350;

/** One captured checkpoint = the item sub-tree BEFORE (past) / to-restore-to (future). */
export interface HistoryEntry {
  snapshot: unknown;
  label: string;
  ts: number;
}

/** Per-item undo/redo stacks, scoped to a single held edit session. */
export interface ItemHistory {
  key: ItemKey;
  domain: EditHistoryDomain;
  /** Sub-tree clone captured at beginSession (session start = implicit bottom of `past`).
   *  SHARED from the held session's one baseline clone (never re-cloned, never mutated). */
  baseline: unknown;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** RESERVED — invalidate-on-remote is DEFERRED (the edit-lock makes the node
   *  mutual-exclusive, so a concurrent invalidation cannot happen while HELD). Never set. */
  guard?: unknown;
}

export interface EditHistoryState {
  /** key → stacks. One entry per live held session (usually 0..1 while a space is open). */
  histories: Record<string, ItemHistory>;
  /** The session the hotkey + toolbar act on (the currently-held item). */
  activeKey: ItemKey | null;
  /** True WHILE an undo/redo apply mutates the snapshot store — capture skips it. */
  isApplyingHistory: boolean;

  setApplyingHistory: (v: boolean) => void;
  /** Open (or reset) the session for `key`; `baseline` is the SHARED held-session clone. */
  beginSession: (key: ItemKey, baseline: unknown, domain: EditHistoryDomain) => void;
  /** Push `prevSnapshot` (pre-gesture sub-tree) onto past, clear future, cap MAX_HISTORY. */
  capture: (key: ItemKey, prevSnapshot: unknown, label: string) => void;
  /** Move the top of past → future and restore it (acts on activeKey). */
  undo: () => void;
  /** Move the top of future → past and restore it (acts on activeKey). */
  redo: () => void;
  /** Delete the session's stacks; clear activeKey if it matched. */
  endSession: (key: ItemKey) => void;
  /** Clear ALL sessions (book-change / logout). */
  reset: () => void;
}
