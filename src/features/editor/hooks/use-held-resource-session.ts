// use-held-resource-session — the per-spread / per-entity HELD edit-lock session
// (ADR-044 §Revision 2026-07-10). A dedicated FORK of use-resource-lock-session (which
// stays untouched, serving only the 2 live sketch consumers — Validation S1 Q2), so a
// regression here cannot touch the sketch path. Serves THREE consumers:
//   • scene per-spread   (step 2, rtype 6,  ownedKeys = SCENE_OWNED_KEYS)
//   • retouch per-spread (step 3, rtype 10, ownedKeys = RETOUCH_OWNED_KEYS)
//   • illustration entity (step 2, rtype 3/4/5, ownedKeys = undefined → WHOLE node)
//
// Beyond the sketch hook it adds:
//   • ownedKeys sub-tree scoping — baseline, dirty-diff, and save patch operate on the
//     OWNED-KEY projection of the node (so scene ∥ retouch on the same spread don't
//     clobber); undefined ⇒ the whole node (entity).
//   • saveNow() — explicit save WHILE STILL HOLDING (retouch modal commit, Validation
//     S1 Q3) — persists the current sub-tree and rebases the baseline so the eventual
//     release-time save doesn't double-write.
//   • onAcquired / onReleased nexus — the undo/redo store (P04) ties begin/endSession
//     to these, SHARING the one baseline clone (DRY: one structuredClone drives lock
//     baseline + history baseline).
//
// LOCK-ON-CLICK: like the sketch hook, the acquire effect keys on the STRING `target`
// key only and fires whenever `target` is non-null. The CALLER enforces lock-on-click
// by keeping `target` null until a USER click selects a resource (never auto-selecting
// into it). React runs the OLD cleanup (release-of-old) before the NEW effect
// (acquire-of-new), so a switch is release-then-acquire automatically.
//
// React-19 constraints honored (identical discipline to the sketch hook): STRING dep
// only; no set-state-in-effect (status derived in render); latest callbacks/accessors
// in a ref written inside an effect; cleanup guarded by a local `cancelled` flag (never
// a ref-guard-before-await, which breaks StrictMode).

import { useCallback, useEffect, useRef, useState } from 'react';
import { dequal } from 'dequal';
import { createLogger } from '@/utils/logger';
import {
  useResourceLockStore,
  keyOf,
  type LockTarget,
  type SavePayload,
  type SessionStatus,
} from '@/stores/resource-lock-store';
import { extractOwnedSubtree } from '@/stores/snapshot-store/slices/collab-owned-subtree';

const log = createLogger('Editor', 'useHeldResourceSession');

export interface UseHeldResourceSessionArgs {
  /** Resource currently being edited (null = holding nothing → session idle). Kept null
   *  until a USER click selects → this is the lock-on-click choke point. */
  target: LockTarget | null;
  /** Reads the current node from the snapshot store (baseline + dirty diff source). */
  getNode: () => unknown;
  /** When set, baseline/dirty/patch operate on the OWNED-KEY sub-tree of the node
   *  (per-spread scene/retouch). Undefined ⇒ the WHOLE node (entity). */
  ownedKeys?: readonly string[];
  /** Maps the projected node (sub-tree when ownedKeys set, else whole node) → save payload. */
  buildPayload: (projected: unknown) => SavePayload;
  /** 409 on acquire → another editor holds it (holder MAY be ''). Caller toasts; does NOT acquire. */
  onBlocked?: (holder: string) => void;
  /** Heartbeat 409 → lock stolen mid-edit. Receives the pre-edit baseline (non-null here). */
  onLost?: (baseline: unknown) => void;
  /** Undo nexus (P04): fires right after acquire succeeds, with the baseline clone (beginSession). */
  onAcquired?: (target: LockTarget, baseline: unknown) => void;
  /** Undo nexus (P04): fires on release/switch/unmount (endSession). */
  onReleased?: (target: LockTarget) => void;
}

export interface UseHeldResourceSessionResult {
  status: SessionStatus;
  /**
   * Explicit save while STILL holding the lock (retouch modal commit). Persists the
   * current projected sub-tree via the gateway (no release), then rebases the baseline
   * so the release-time dirty-diff won't double-save. Resolves `false` when nothing is
   * held for the current target or the save was rejected (lost/forbidden).
   */
  saveNow: () => Promise<boolean>;
}

type SessionOutcome = { key: string; status: 'held' | 'blocked' | 'lost' };

export function useHeldResourceSession(
  args: UseHeldResourceSessionArgs,
): UseHeldResourceSessionResult {
  const { target } = args;
  const bookId = useResourceLockStore((s) => s.bookId);
  const [outcome, setOutcome] = useState<SessionOutcome | null>(null);

  // Latest args in a ref (written inside an effect — never the render body).
  const cbRef = useRef(args);
  useEffect(() => {
    cbRef.current = args;
  });

  // Baseline PROJECTION (owned sub-tree or whole node) captured at acquire. In a ref so
  // saveNow() — called from outside the acquire effect — can rebase it. Written only in
  // async/event callbacks (acquire .then, saveNow), never in render.
  const baselineRef = useRef<unknown>(null);

  const serialized = target && bookId ? keyOf(bookId, target) : null;

  // Project a node to the diff/save unit: owned sub-tree (per-spread) or whole node (entity).
  const projectRef = useRef(args.ownedKeys);
  useEffect(() => {
    projectRef.current = args.ownedKeys;
  });
  const project = useCallback((node: unknown): unknown => {
    const keys = projectRef.current;
    return keys ? extractOwnedSubtree(node, keys) : node;
  }, []);

  useEffect(() => {
    if (!serialized || !target || !bookId) return;

    const key = serialized;
    let cancelled = false;
    log.info('acquire', 'held session start', { key });

    const store = useResourceLockStore.getState();

    store
      .acquire(target)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          log.debug('acquire', 'blocked (409)', { key, hasHolder: !!res.holder });
          setOutcome({ key, status: 'blocked' });
          cbRef.current.onBlocked?.(res.holder ?? '');
          return;
        }
        // Held → baseline = clone of the PROJECTED node (sub-tree or whole).
        const base = structuredClone(project(cbRef.current.getNode()));
        baselineRef.current = base;
        store.addMyLock(target);
        setOutcome({ key, status: 'held' });
        log.info('acquire', 'held', { key });
        // Undo nexus: beginSession shares this exact baseline clone.
        cbRef.current.onAcquired?.(target, base);
      })
      .catch((err) => {
        if (cancelled) return;
        log.error('acquire', 'acquire threw — treat as blocked', {
          key,
          error: err instanceof Error ? err.message : String(err),
        });
        setOutcome({ key, status: 'blocked' });
        cbRef.current.onBlocked?.('');
      });

    store.registerOnLost(key, () => {
      log.warn('onLost', 'lock lost via heartbeat', { key });
      cbRef.current.onLost?.(baselineRef.current);
      cbRef.current.onReleased?.(target);
      setOutcome({ key, status: 'lost' });
    });

    return () => {
      cancelled = true;
      const s = useResourceLockStore.getState();
      if (!s.myLocks.has(key)) {
        s.unregisterOnLost(key);
        log.debug('cleanup', 'no lock held — skip release', { key });
        return;
      }
      const rawNode = cbRef.current.getNode();
      // A null node = the held resource was DELETED out from under the session (entity
      // delete, or a spread removed) → nothing to persist here; the deletion is saved by
      // the explicit collection-op path (action 4). Release the lock WITHOUT a save (a
      // null whole-node patch would 400 on the gateway).
      const projected = project(rawNode);
      const dirty = rawNode != null && !dequal(projected, baselineRef.current);
      log.info('release', 'release-and-save', { key, dirty, nodeGone: rawNode == null });
      void s.releaseAndSave(target, dirty, dirty ? cbRef.current.buildPayload(projected) : undefined);
      s.removeMyLock(target);
      s.unregisterOnLost(key);
      baselineRef.current = null;
      cbRef.current.onReleased?.(target);
    };
    // STRING dep only — see sketch hook rationale (object dep would churn acquire→release).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, project]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    const t = cbRef.current.target;
    const bid = useResourceLockStore.getState().bookId;
    if (!t || !bid) return false;
    const key = keyOf(bid, t);
    const s = useResourceLockStore.getState();
    if (!s.myLocks.has(key)) {
      log.debug('saveNow', 'not holding — skip', { key });
      return false;
    }
    const rawNode = cbRef.current.getNode();
    if (rawNode == null) {
      log.debug('saveNow', 'node gone — skip (deletion handled by explicit path)', { key });
      return false;
    }
    const projected = project(rawNode);
    if (dequal(projected, baselineRef.current)) {
      log.debug('saveNow', 'not dirty — skip', { key });
      return true; // already persisted; nothing to do
    }
    log.info('saveNow', 'explicit save while held', { key });
    const res = await s.save(t, cbRef.current.buildPayload(projected));
    if (res.ok) {
      baselineRef.current = structuredClone(projected); // rebase so release won't double-save
      return true;
    }
    log.warn('saveNow', 'save rejected', { key, lost: res.lost, forbidden: res.forbidden });
    return false;
  }, [project]);

  const status: SessionStatus = !serialized
    ? 'idle'
    : outcome && outcome.key === serialized
      ? outcome.status
      : 'acquiring';

  return { status, saveNow };
}
