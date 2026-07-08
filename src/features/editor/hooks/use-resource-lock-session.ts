// use-resource-lock-session — binds the ONE currently-selected sketch resource to
// the edit-lock lifecycle: acquire → snapshot baseline → (on deselect/unmount)
// release-and-save-if-dirty. This is the integration surface consumed by the
// spread canvas (phase 04) and the entity modal (phase 05).
//
// Lifecycle authority = the gateway (acquire 409 = held by another editor). This
// hook only drives the client-side session status + the dirty-gated save on release.
//
// React-19 constraints honored:
//   • The acquire effect keys ONLY on the STRING `serialized` (keyOf) — never the
//     `target` OBJECT — so a new-but-equal target does not refire it (would churn
//     acquire→release). `target`/`bookId` captured in-closure are value-equal to
//     `serialized` by construction.
//   • NO synchronous set-state-in-effect: the transient 'idle'/'acquiring' statuses
//     are DERIVED in render; only the async acquire/heartbeat CALLBACKS write state
//     (`outcome`, key-tagged) — mirroring the repo's accepted use-my-collaboration
//     pattern (a stale outcome from a previous key is discarded by the key check).
//   • Latest getNode/buildPayload/onBlocked/onLost kept in a ref updated inside an
//     effect (never the render body) so their identity churn never refires acquire.
//   • Cleanup uses a local `cancelled` flag (NOT a ref-guard-before-await, which
//     breaks StrictMode). React runs the OLD cleanup before the NEW effect, so
//     release-of-old precedes acquire-of-new automatically on a target switch.

import { useEffect, useRef, useState } from 'react';
import { dequal } from 'dequal';
import { createLogger } from '@/utils/logger';
import {
  useResourceLockStore,
  keyOf,
  type LockTarget,
  type SavePayload,
  type SessionStatus,
} from '@/stores/resource-lock-store';

const log = createLogger('Editor', 'useResourceLockSession');

export interface UseLockSessionArgs {
  /** Resource currently being edited (null = holding nothing → session idle). */
  target: LockTarget | null;
  /** Reads the current node from the snapshot store (used for baseline + dirty diff). */
  getNode: () => unknown;
  /** Maps a node → gateway save payload (action/patch/target_ref). */
  buildPayload: (node: unknown) => SavePayload;
  /** 409 on acquire → another editor holds it. `holder` MAY be '' (registry lag);
   *  the caller shows a generic fallback when empty (do NOT block on it). */
  onBlocked?: (holder: string) => void;
  /** Heartbeat 409 → the lock was stolen mid-edit (SRS §10 = revert). Receives the
   *  pre-edit `baseline` node captured at acquire time; caller writes it back to the
   *  snapshot store + force-deselects. `baseline` is null only if the lock was never
   *  fully held (onLost cannot fire before acquire success, so it is non-null here). */
  onLost?: (baseline: unknown) => void;
}

export interface UseLockSessionResult {
  status: SessionStatus;
}

/** Async acquire/heartbeat outcome, TAGGED with the key it belongs to so the render
 *  derivation discards a stale outcome after the selected target changes. */
type SessionOutcome = { key: string; status: 'held' | 'blocked' | 'lost' };

export function useResourceLockSession(args: UseLockSessionArgs): UseLockSessionResult {
  const { target } = args;

  // bookId read reactively (primitive) so `serialized` recomputes — and the acquire
  // effect fires — the moment `connect()` lands the book into the store.
  const bookId = useResourceLockStore((s) => s.bookId);

  const [outcome, setOutcome] = useState<SessionOutcome | null>(null);

  // Latest callbacks/node-accessors, refreshed every render INSIDE an effect (writing
  // a ref in the render body is a React-19 lint error). The acquire effect reads the
  // ref so callback identity churn never refires it.
  const cbRef = useRef(args);
  useEffect(() => {
    cbRef.current = args;
  });

  const serialized = target && bookId ? keyOf(bookId, target) : null;

  useEffect(() => {
    // No target / not yet connected → nothing to acquire (status derives to 'idle').
    if (!serialized || !target || !bookId) return;

    const key = serialized;
    let cancelled = false;
    let baseline: unknown = null;
    log.info('acquire', 'session start', { key });

    const store = useResourceLockStore.getState();

    store
      .acquire(target)
      .then((res) => {
        if (cancelled) {
          log.debug('acquire', 'resolved after cancel — ignore', { key });
          return;
        }
        if (!res.ok) {
          // holder MAY be '' — pass through as-is; caller shows a generic fallback.
          log.debug('acquire', 'blocked (409) — held by another editor', { key, hasHolder: !!res.holder });
          setOutcome({ key, status: 'blocked' });
          cbRef.current.onBlocked?.(res.holder ?? '');
          return;
        }
        // Held → snapshot the baseline for the release-time dirty diff.
        baseline = structuredClone(cbRef.current.getNode());
        store.addMyLock(target); // idempotent — acquire() already added it
        setOutcome({ key, status: 'held' });
        log.info('acquire', 'held', { key });
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

    // Heartbeat 409 → store invokes this cb → caller reverts node + deselects; mark lost.
    store.registerOnLost(key, () => {
      log.warn('onLost', 'lock lost via heartbeat', { key });
      cbRef.current.onLost?.(baseline);
      setOutcome({ key, status: 'lost' });
    });

    return () => {
      cancelled = true;
      const s = useResourceLockStore.getState();
      // Not (yet) holding this key — still acquiring, or blocked. Nothing to release;
      // just drop the onLost registration. (Live myLocks read, not a stale closure.)
      if (!s.myLocks.has(key)) {
        s.unregisterOnLost(key);
        log.debug('cleanup', 'no lock held — skip release', { key });
        return;
      }
      const node = cbRef.current.getNode();
      const dirty = !dequal(node, baseline);
      log.info('release', 'release-and-save', { key, dirty });
      // Fire-and-forget: on unmount the component is gone; the lock TTL insures the save.
      void s.releaseAndSave(target, dirty, dirty ? cbRef.current.buildPayload(node) : undefined);
      s.removeMyLock(target);
      s.unregisterOnLost(key);
    };
    // Dep = `serialized` STRING ONLY. `target`/`bookId` are the exact values that
    // produced it (value-equal), captured in-closure on purpose to avoid an
    // object-identity refire (see memory: dep must be a string, not the target obj).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  // Derive the public status in render (NO set-state-in-effect): no target → idle;
  // an outcome for the CURRENT key → its status; otherwise the acquire for this key
  // is still in flight → acquiring. A stale outcome (prev key) is ignored here.
  const status: SessionStatus = !serialized
    ? 'idle'
    : outcome && outcome.key === serialized
      ? outcome.status
      : 'acquiring';

  return { status };
}
