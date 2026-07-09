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
} from '@/apis/resource-lock-api';
import {
  openResourceLocksChannel,
  fetchResourceLocks,
  type ChannelHandle,
} from './channel';
import { startHeartbeatLoop, startPruneTick } from './heartbeat';
import { fetchProfileNames } from './holder-names';
import {
  keyOf,
  rowKey,
  rowToEntry,
  FALLBACK_HOLDER_NAME,
  type LockTarget,
  type LockEntry,
  type SavePayload,
  type ResourceLockRawRow,
} from './types';

const log = createLogger('Store', 'ResourceLockStore');

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
  save: (t: LockTarget, p: SavePayload) => Promise<{ ok: true } | { ok: false; lost: boolean; forbidden: boolean }>;
  releaseAndSave: (t: LockTarget, dirty: boolean, payload?: SavePayload) => Promise<void>;

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
        log.info('save', 'request', { key, action: p.action_type, log: p.log !== false });
        const r = await saveResource(bookId, t, p);
        if (r.ok) {
          log.info('save', 'saved', { key });
          return { ok: true };
        }
        if (r.lost) log.warn('save', 'save rejected — lock/node lost', { key });
        else if (r.forbidden) log.warn('save', 'save forbidden — missing resource access', { key });
        else log.error('save', 'save failed', { key });
        return { ok: false, lost: r.lost, forbidden: r.forbidden };
      },

      releaseAndSave: async (t, dirty, payload) => {
        // Bind bookId ONCE up-front, then call the API fns directly with it — do NOT route through
        // get().save / get().release, which re-read get().bookId at await-resume time. This method is
        // fire-and-forget from the lock-session cleanup; on a space/book UNMOUNT that cleanup runs
        // immediately before useCollabPersistSession's disconnect() nulls bookId. The save's network
        // await lets disconnect interleave, so a re-read would see null and SKIP the unlock → the
        // peer's grey-out lingers until the lock TTL (~60s). Capturing bookId keeps the whole
        // save→unlock bound to this book regardless of a concurrent disconnect.
        const bookId = get().bookId;
        if (!bookId) {
          log.warn('releaseAndSave', 'no book connected', {});
          return;
        }
        const key = keyOf(bookId, t);
        log.info('releaseAndSave', 'start', { key, dirty, hasPayload: !!payload });
        if (dirty && payload) {
          // save REQUIRES a live lock (precondition) → must run BEFORE unlock.
          const r = await saveResource(bookId, t, payload);
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
export { keyOf, FALLBACK_HOLDER_NAME } from './types';
export * from './selectors';
export * from './imperative-guards';
