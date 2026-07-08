// resource-lock-store/heartbeat.ts — Two background timers for the lock store.
// Both run inside setInterval (OUTSIDE React render), so calling Date.now() /
// mutating store state from them is allowed under React-19 (only set-state IN
// render is banned).
//
//   - heartbeat loop (30s): renew every lock I hold; a definitive 409 (lost)
//     fires onLost(key). A TRANSIENT failure (network / 5xx) does NOT fire onLost
//     — the 60s TTL buffers one miss, and the next tick retries.
//   - prune tick (15s): drop registry entries whose expires_at < now() so a
//     stale grey-out flips back to editable without waiting for a realtime event.

import { createLogger } from '@/utils/logger';
import type { LockTarget } from './types';

const log = createLogger('Store', 'ResourceLockHeartbeat');

const HEARTBEAT_INTERVAL_MS = 30_000;
const PRUNE_INTERVAL_MS = 15_000;

export interface HeartbeatLoopArgs {
  /** Snapshot of the locks I currently hold (key + target for the renew call). */
  getMyLocks: () => Array<{ key: string; target: LockTarget }>;
  /** Renew one lock. `lost` = definitive 409; else transient. */
  renew: (target: LockTarget) => Promise<{ ok: boolean; lost: boolean }>;
  /** Called with the lock key when a renew comes back lost (409). */
  onLost: (key: string) => void;
}

/** Start the 30s heartbeat loop. Returns a stop() to clear it. */
export function startHeartbeatLoop(args: HeartbeatLoopArgs): () => void {
  const { getMyLocks, renew, onLost } = args;
  const id = setInterval(() => {
    const locks = getMyLocks();
    if (locks.length === 0) return;
    log.debug('heartbeatTick', 'renew held locks', { count: locks.length });
    for (const { key, target } of locks) {
      void (async () => {
        try {
          const r = await renew(target);
          if (!r.ok && r.lost) {
            log.warn('heartbeatTick', 'lock lost — firing onLost', { key });
            onLost(key);
          } else if (!r.ok) {
            log.warn('heartbeatTick', 'renew transient failure — will retry next tick', { key });
          }
        } catch (err) {
          log.error('heartbeatTick', 'renew threw', {
            key,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }
  }, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(id);
}

export interface PruneTickArgs {
  /** Drop expired registry entries; returns the count removed (for logging). */
  pruneExpired: () => number;
}

/** Start the 15s prune tick. Returns a stop() to clear it. */
export function startPruneTick(args: PruneTickArgs): () => void {
  const { pruneExpired } = args;
  const id = setInterval(() => {
    const removed = pruneExpired();
    if (removed > 0) log.debug('pruneTick', 'pruned expired locks', { count: removed });
  }, PRUNE_INTERVAL_MS);
  return () => clearInterval(id);
}
