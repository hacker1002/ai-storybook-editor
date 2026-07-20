// resource-lock-store/index.ts — Zustand store for the collaborator edit-lock
// feature. Owns ONE realtime channel per book (lock registry for grey-out UX) +
// the lock lifecycle ops (acquire → heartbeat → save-if-dirty → unlock).
//
// Authority = the gateway (acquire 409), NOT this registry. The registry / myLocks
// are advisory: they drive grey-out UX and the heartbeat target set only.
//
// Compose-only file: realtime in channel.ts, timers in heartbeat.ts, name lookup
// in holder-names.ts, read-side hooks in selectors.ts.
//
// Non-reactive module scope (channel handle, timers, myLock targets, onLost
// registry, in-flight name dedupe) is kept OUT of zustand state so churn there
// never triggers a component re-render.

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { createLogger } from '@/utils/logger';
import { useAuthStore } from '@/stores/auth-store';
import {
  acquireResourceLock,
  renewResourceLock,
  releaseResourceLock,
  saveResource,
  type SaveResult,
} from '@/apis/resource-lock-api';
import {
  openResourceLocksChannel,
  fetchResourceLocks,
  type ChannelHandle,
} from './channel';
import { startHeartbeatLoop, startPruneTick } from './heartbeat';
import { fetchProfileNames } from './holder-names';
import { isSketchWriteBlocked } from './write-blocker';
import { toastSaveBlockedDegraded } from '@/utils/collab-save-toasts';
import {
  keyOf,
  rowKey,
  rowToEntry,
  FALLBACK_HOLDER_NAME,
  ACTION_TYPE_CREATE,
  type LockTarget,
  type LockEntry,
  type SavePayload,
  type ResourceLockRawRow,
} from './types';

const log = createLogger('Store', 'ResourceLockStore');

/**
 * Gateway save + ONE nested-CREATE retry when the node turns out not to exist yet.
 *
 * Nodes minted client-side (`crypto.randomUUID()` — e.g. a generated sketch spread page image)
 * have never been written to the DB, so an EDIT/UPLOAD addressed by their id resolves to no path
 * and the gateway answers 404. When the caller supplied `create_fallback` we retry ONCE as a
 * nested CREATE (`action_type` 2 + `parent_id`/`collection`) so the gateway appends the node under
 * its parent instead. Shared by `save` and `releaseAndSave` (single implementation).
 *
 * AUDIT: the gateway writes the activity row straight from `action_type`, and a create can only
 * be requested as `action_type` 2 (`save_ops.is_create`) — so an unqualified retry would log the
 * user's Edit/Extract as "created". The repair create is therefore sent with `log: false` (it is
 * infrastructure recovery, not a user action) and, once the node exists, the ORIGINAL payload is
 * re-issued: it now resolves, so the audit row (and its server-built `metadata.sync` descriptor
 * for peers) names the real action. The extra round-trip only ever happens on this rare 404 path;
 * if the re-log fails the data is already saved, so the create's success is what we report.
 */
async function saveWithCreateFallback(
  bookId: string,
  t: LockTarget,
  p: SavePayload,
): Promise<SaveResult> {
  const first = await saveResource(bookId, t, p);
  if (first.ok || !first.notFound || !p.create_fallback || p.action_type === ACTION_TYPE_CREATE) {
    return first;
  }
  log.debug('saveWithCreateFallback', 'node not found — retry as nested create', {
    resourceType: t.resource_type,
    resourceId: t.resource_id,
    collection: p.create_fallback.collection,
  });
  const created = await saveResource(bookId, t, {
    ...p,
    action_type: ACTION_TYPE_CREATE,
    parent_id: p.create_fallback.parent_id,
    collection: p.create_fallback.collection,
    log: false, // never audit the repair as a "create" — see AUDIT note above
  });
  if (!created.ok || p.log === false) {
    return created; // failed, or the caller wanted no audit anyway (generate job)
  }
  log.debug('saveWithCreateFallback', 're-issuing original action for an accurate audit row', {
    resourceType: t.resource_type,
    actionType: p.action_type,
  });
  const relogged = await saveResource(bookId, t, p);
  if (!relogged.ok) {
    log.warn('saveWithCreateFallback', 'audit re-issue failed — data already saved by the create', {
      resourceType: t.resource_type,
      resourceId: t.resource_id,
    });
    return created;
  }
  return relogged;
}

export interface ResourceLockState {
  // === State (reactive) ===
  bookId: string | null;
  /** Current signed-in user id ("me"), resolved once at connect. */
  myUserId: string | null;
  /** key → live lock (every holder, incl. me). */
  registry: Map<string, LockEntry>;
  /** keys I currently hold (heartbeat target set; phase-03 reads which I hold). */
  myLocks: Set<string>;
  /** holder_user_id → profiles.name (tooltip cache). */
  holderNames: Map<string, string>;
  /** true inside a sketch collab space → snapshot-store suppresses autoSave and
   *  delegates the flush to `releaseAndSave` (write-path §7). */
  collabPersist: boolean;

  // === Realtime lifecycle ===
  connect: (bookId: string) => void;
  disconnect: () => void;

  // === Lock ops (Bearer JWT; holder/actor server-derived) ===
  acquire: (t: LockTarget) => Promise<{ ok: true } | { ok: false; code: 'LOCK_HELD'; holder: string }>;
  renew: (t: LockTarget) => Promise<boolean>;
  release: (t: LockTarget) => Promise<void>;
  /** `blocked` (ADR-047): the write was refused client-side because the target subtree is
   *  DEGRADED (consent pending) — distinct from lost/forbidden, nothing reached the gateway.
   *  `notFound`: the gateway could not address the node (404 — a subset of `lost`); callers that
   *  mint nodes client-side retry it as a nested CREATE (see `SavePayload.create_fallback`). */
  save: (t: LockTarget, p: SavePayload) => Promise<{ ok: true } | { ok: false; lost: boolean; forbidden: boolean; notFound?: boolean; blocked?: boolean }>;
  releaseAndSave: (t: LockTarget, dirty: boolean, payload?: SavePayload, bookIdOverride?: string) => Promise<void>;

  // === Phase-03 surface ===
  setCollabPersist: (v: boolean) => void;
  registerOnLost: (key: string, cb: () => void) => void;
  unregisterOnLost: (key: string) => void;
  addMyLock: (t: LockTarget) => void;
  removeMyLock: (t: LockTarget) => void;

  // === Internal (channel/timer wiring — not for components) ===
  applyUpsert: (row: ResourceLockRawRow) => void;
  applyDelete: (row: ResourceLockRawRow) => void;
  seedRegistry: () => Promise<void>;
  pruneExpired: () => number;
  resolveHolderNames: (userIds: string[]) => Promise<void>;
}

// ── Non-reactive module scope ─────────────────────────────────────────────────
let channelHandle: ChannelHandle | null = null;
let stopHeartbeat: (() => void) | null = null;
let stopPrune: (() => void) | null = null;
/** key → target for the locks I hold (heartbeat needs the full target to renew;
 *  parsing it back out of the composite key would be lossy if resource_id had a
 *  '|'). Kept in sync with state.myLocks. */
const myLockTargets = new Map<string, LockTarget>();
/** key → onLost callback (registered by the phase-03 session hook). */
const onLostRegistry = new Map<string, () => void>();
/** user ids with a profile-name fetch in flight (dedupe). */
let holderNamesInFlight = new Set<string>();

export const useResourceLockStore = create<ResourceLockState>()(
  devtools(
    (set, get) => ({
      bookId: null,
      myUserId: null,
      registry: new Map(),
      myLocks: new Set(),
      holderNames: new Map(),
      collabPersist: false,

      // ── Realtime lifecycle ──────────────────────────────────────────────────
      connect: (bookId) => {
        if (channelHandle && get().bookId === bookId) {
          log.debug('connect', 'already connected — no-op', { bookId });
          return;
        }
        if (channelHandle) {
          log.info('connect', 'book changed — reconnect', { prev: get().bookId, next: bookId });
          get().disconnect();
        }

        const myUserId = useAuthStore.getState().user?.id ?? null;
        if (!myUserId) {
          log.warn('connect', 'no signed-in user — locks will all read as other-held', { bookId });
        }
        log.info('connect', 'open channel', { bookId, hasUser: !!myUserId });
        set({ bookId, myUserId, registry: new Map(), myLocks: new Set(), holderNames: new Map() });
        myLockTargets.clear();
        holderNamesInFlight = new Set();

        // SYNC-create the channel (no await before it) so disconnect always has a ref.
        channelHandle = openResourceLocksChannel({
          bookId,
          onUpsert: (row) => get().applyUpsert(row),
          onDelete: (row) => get().applyDelete(row),
          onLive: () => {},
          onDown: () => {},
          onReseed: () => {
            void get().seedRegistry();
          },
        });

        // Seed once immediately (covers locks that existed before this mount).
        void get().seedRegistry();

        stopHeartbeat = startHeartbeatLoop({
          getMyLocks: () =>
            Array.from(myLockTargets.entries()).map(([key, target]) => ({ key, target })),
          renew: async (target) => {
            const currentBook = get().bookId;
            if (!currentBook) return { ok: false, lost: false };
            const r = await renewResourceLock(currentBook, target);
            return r.ok ? { ok: true, lost: false } : { ok: false, lost: r.lost };
          },
          onLost: (key) => {
            // Stop renewing this key + notify the session hook (phase 03).
            const target = myLockTargets.get(key);
            myLockTargets.delete(key);
            if (get().myLocks.has(key)) {
              const next = new Set(get().myLocks);
              next.delete(key);
              set({ myLocks: next });
            }
            log.warn('connect', 'heartbeat lost lock', { key, hadTarget: !!target });
            const cb = onLostRegistry.get(key);
            if (cb) {
              try {
                cb();
              } catch (err) {
                log.error('connect', 'onLost callback threw', {
                  key,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            } else {
              log.warn('connect', 'lost lock but no onLost registered', { key });
            }
          },
        });
        stopPrune = startPruneTick({ pruneExpired: () => get().pruneExpired() });
      },

      disconnect: () => {
        log.info('disconnect', 'close store', { bookId: get().bookId });
        if (channelHandle) {
          channelHandle.teardown();
          channelHandle = null;
        }
        if (stopHeartbeat) {
          stopHeartbeat();
          stopHeartbeat = null;
        }
        if (stopPrune) {
          stopPrune();
          stopPrune = null;
        }
        myLockTargets.clear();
        onLostRegistry.clear();
        holderNamesInFlight = new Set();
        // collabPersist reset to false: leaving the book must stop collab-persist
        // routing (else a stale `true` would keep suppressing autoSave).
        set({
          bookId: null,
          myUserId: null,
          registry: new Map(),
          myLocks: new Set(),
          holderNames: new Map(),
          collabPersist: false,
        });
      },

      // ── Lock ops ────────────────────────────────────────────────────────────
      acquire: async (t) => {
        const bookId = get().bookId;
        if (!bookId) {
          log.warn('acquire', 'no book connected', {});
          return { ok: false, code: 'LOCK_HELD', holder: '' };
        }
        const key = keyOf(bookId, t);
        log.info('acquire', 'request', { key });
        const res = await acquireResourceLock(bookId, t);
        if (res.ok) {
          get().addMyLock(t);
          log.info('acquire', 'acquired', { key });
          return { ok: true };
        }
        // Blocked — resolve the holder from the realtime registry (authority for
        // "who") else the best-effort body holder, else empty.
        const holder = get().registry.get(key)?.holder_user_id ?? res.holder ?? '';
        if (holder) void get().resolveHolderNames([holder]);
        log.info('acquire', 'blocked', { key, code: res.code, hasHolder: !!holder });
        return { ok: false, code: 'LOCK_HELD', holder };
      },

      renew: async (t) => {
        const bookId = get().bookId;
        if (!bookId) {
          log.warn('renew', 'no book connected', {});
          return false;
        }
        const r = await renewResourceLock(bookId, t);
        return r.ok;
      },

      release: async (t) => {
        const bookId = get().bookId;
        if (!bookId) {
          log.warn('release', 'no book connected', {});
          return;
        }
        const key = keyOf(bookId, t);
        log.info('release', 'request', { key });
        await releaseResourceLock(bookId, t);
        get().removeMyLock(t);
      },

      save: async (t, p) => {
        const bookId = get().bookId;
        if (!bookId) {
          log.warn('save', 'no book connected', {});
          return { ok: false, lost: false, forbidden: false };
        }
        const key = keyOf(bookId, t);
        // ADR-047 layer-1 guard: the target subtree is DEGRADED (unreadable raw quarantined,
        // consent pending) → refuse the write so the in-memory placeholder can never reach the
        // DB. Data-safety guard, NOT authz — the gateway stays the authority.
        if (isSketchWriteBlocked(t)) {
          log.warn('save', 'write blocked — degraded sketch resource (consent pending)', { key });
          toastSaveBlockedDegraded();
          return { ok: false, lost: false, forbidden: false, blocked: true };
        }
        log.info('save', 'request', { key, action: p.action_type, log: p.log !== false });
        const r = await saveWithCreateFallback(bookId, t, p);
        if (r.ok) {
          log.info('save', 'saved', { key });
          return { ok: true };
        }
        if (r.lost) log.warn('save', 'save rejected — lock/node lost', { key });
        else if (r.forbidden) log.warn('save', 'save forbidden — missing resource access', { key });
        else log.error('save', 'save failed', { key });
        return { ok: false, lost: r.lost, forbidden: r.forbidden, notFound: r.notFound };
      },

      releaseAndSave: async (t, dirty, payload, bookIdOverride) => {
        // Bind bookId ONCE up-front, then call the API fns directly with it — do NOT route through
        // get().save / get().release, which re-read get().bookId at await-resume time. This method is
        // fire-and-forget from the lock-session cleanup; on a space/book UNMOUNT that cleanup runs
        // ALONGSIDE useCollabPersistSession's disconnect() (declared first → runs first), which has
        // ALREADY nulled store.bookId by the time we get here. So the caller passes the bookId it
        // captured at acquire-time (`bookIdOverride`); we only fall back to get().bookId for the
        // in-space release path where the store is still connected. This keeps the whole save→unlock
        // bound to this book regardless of the concurrent disconnect.
        const bookId = bookIdOverride ?? get().bookId;
        if (!bookId) {
          log.warn('releaseAndSave', 'no book connected', {});
          return;
        }
        const key = keyOf(bookId, t);
        log.info('releaseAndSave', 'start', { key, dirty, hasPayload: !!payload });
        // ADR-047 layer-1 guard: degraded subtree → SKIP the save (the local changes sit on a
        // placeholder, persisting would wipe the quarantined data) but STILL release the lock —
        // never strand it. Explicit here rather than relying on save()'s reject shape (I3).
        if (dirty && payload && isSketchWriteBlocked(t)) {
          log.warn('releaseAndSave', 'write blocked — degraded resource; skip save, still unlock', { key });
          toastSaveBlockedDegraded();
          dirty = false;
        }
        if (dirty && payload) {
          // save REQUIRES a live lock (precondition) → must run BEFORE unlock. A 404 on a
          // client-minted node retries ONCE as a nested CREATE when the caller passed
          // `create_fallback` (sketch spread page images) — see saveWithCreateFallback.
          const r = await saveWithCreateFallback(bookId, t, payload);
          // EXPECTED outcomes keep their own levels below: `lost` (409/404 — warn) and `forbidden`
          // (403 access gate — warn, mirroring saveResource/save). Only a genuine/transient failure
          // escalates to error, which runs in production (logging-convention §Environment).
          if (!r.ok && !r.lost && !r.forbidden) {
            log.error('releaseAndSave', 'save failed — local changes kept', { key });
          } else if (!r.ok && r.forbidden) {
            log.warn('releaseAndSave', 'save forbidden — missing resource access', { key });
          }
          if (!r.ok && r.lost) {
            log.warn('releaseAndSave', 'lock lost — keep local changes, skip unlock', { key });
            // Lock already gone/stolen → unlock is a no-op; just drop local bookkeeping.
            get().removeMyLock(t);
            return;
          }
        }
        await releaseResourceLock(bookId, t);
        get().removeMyLock(t);
        log.info('releaseAndSave', 'released', { key });
      },

      // ── Phase-03 surface ─────────────────────────────────────────────────────
      setCollabPersist: (v) => {
        if (get().collabPersist === v) return;
        log.info('setCollabPersist', 'transition', { prev: get().collabPersist, next: v });
        set({ collabPersist: v });
      },

      registerOnLost: (key, cb) => {
        onLostRegistry.set(key, cb);
        log.debug('registerOnLost', 'registered', { key });
      },

      unregisterOnLost: (key) => {
        onLostRegistry.delete(key);
        log.debug('unregisterOnLost', 'removed', { key });
      },

      addMyLock: (t) => {
        const bookId = get().bookId;
        if (!bookId) return;
        const key = keyOf(bookId, t);
        if (get().myLocks.has(key)) return;
        myLockTargets.set(key, t);
        const next = new Set(get().myLocks);
        next.add(key);
        set({ myLocks: next });
        log.debug('addMyLock', 'added', { key });
      },

      removeMyLock: (t) => {
        const bookId = get().bookId;
        if (!bookId) return;
        const key = keyOf(bookId, t);
        myLockTargets.delete(key);
        if (!get().myLocks.has(key)) return;
        const next = new Set(get().myLocks);
        next.delete(key);
        set({ myLocks: next });
        log.debug('removeMyLock', 'removed', { key });
      },

      // ── Internal (channel/timer wiring) ──────────────────────────────────────
      applyUpsert: (row) => {
        // Handles INSERT (acquire) AND UPDATE (heartbeat-renew + UNLOCK). Unlock is a
        // *soft-release*: the gateway UPDATEs expires_at=now() instead of DELETE (a DELETE
        // realtime event is only delivered under REPLICA IDENTITY FULL and was arriving
        // unreliably → peers saw released locks linger to the TTL). So an unlock lands here
        // as an already-expired entry; we still store it, but the expiry-aware selectors
        // (expires_at > now()) immediately read it as free → grey-out lifts at once, and the
        // 15s prune drops the tombstone. See migration 20260708000003 + api/resource/03-unlock.
        const key = rowKey(row);
        const next = new Map(get().registry);
        next.set(key, rowToEntry(row));
        set({ registry: next });
        log.debug('applyUpsert', 'lock upserted', { key, holder: row.holder_user_id });
        void get().resolveHolderNames([row.holder_user_id]);
      },

      applyDelete: (row) => {
        const key = rowKey(row);
        if (!get().registry.has(key)) {
          log.debug('applyDelete', 'key not in registry — skip', { key });
          return;
        }
        const next = new Map(get().registry);
        next.delete(key);
        set({ registry: next });
        log.debug('applyDelete', 'lock released', { key });
      },

      seedRegistry: async () => {
        const bookId = get().bookId;
        if (!bookId) return;
        const rows = await fetchResourceLocks(bookId);
        // Book changed while the SELECT was in flight → drop this stale seed.
        if (get().bookId !== bookId) {
          log.debug('seedRegistry', 'stale seed ignored (book changed)', { bookId });
          return;
        }
        // Replace registry with the SELECT snapshot (reconcile: removes locks
        // released while we were disconnected). The tiny window where an event
        // races the SELECT self-heals via the next event/heartbeat/prune — the
        // registry is advisory (authority = gateway 409).
        const next = new Map<string, LockEntry>();
        const holders = new Set<string>();
        for (const row of rows) {
          next.set(rowKey(row), rowToEntry(row));
          holders.add(row.holder_user_id);
        }
        set({ registry: next });
        log.info('seedRegistry', 'registry seeded', { bookId, count: next.size });
        void get().resolveHolderNames(Array.from(holders));
      },

      pruneExpired: () => {
        const now = Date.now();
        const reg = get().registry;
        let next: Map<string, LockEntry> | null = null;
        let removed = 0;
        for (const [key, entry] of reg) {
          if (new Date(entry.expires_at).getTime() < now) {
            if (!next) next = new Map(reg);
            next.delete(key);
            removed += 1;
          }
        }
        if (next) set({ registry: next });
        return removed;
      },

      resolveHolderNames: async (userIds) => {
        const have = get().holderNames;
        const missing = userIds.filter(
          (id) => id && !have.has(id) && !holderNamesInFlight.has(id),
        );
        if (missing.length === 0) return;
        missing.forEach((id) => holderNamesInFlight.add(id));
        log.debug('resolveHolderNames', 'fetch profile names', { count: missing.length });
        try {
          const rows = await fetchProfileNames(missing);
          const found = new Map<string, string | null>();
          for (const r of rows) found.set(r.user_id, r.name);
          const next = new Map(get().holderNames);
          for (const id of missing) {
            const name = found.get(id);
            next.set(id, name && name.trim() ? name : FALLBACK_HOLDER_NAME);
          }
          set({ holderNames: next });
        } finally {
          missing.forEach((id) => holderNamesInFlight.delete(id));
        }
      },
    }),
    { name: 'resource-lock-store' },
  ),
);

export type {
  LockTarget,
  LockEntry,
  SavePayload,
  SessionStatus,
  Step,
  ResourceType,
  ResourceLockRawRow,
} from './types';
export { keyOf, FALLBACK_HOLDER_NAME, ACTION_TYPE_CREATE } from './types';
export * from './selectors';
export * from './imperative-guards';
export { setSketchWriteBlocker, isSketchWriteBlocked } from './write-blocker';
