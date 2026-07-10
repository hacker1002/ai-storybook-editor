// use-edit-history-capture.ts — mount ONCE at the editor root. Subscribes to the ACTIVE
// session's sub-tree via the snapshot-store's subscribeWithSelector and turns each settled
// edit gesture into ONE undo checkpoint (ADR-045).
//
// Guards (both mandatory — else infinite capture / spurious undo steps):
//   • isApplyingHistory (edit-history) — an undo/redo apply must not be re-captured.
//   • isApplyingRemotePatch (snapshot)  — a peer's realtime merge must not become an undo step.
//
// React-19 discipline: the effect deps are the STRING activeKey (+ the stable `capture` ref);
// all gesture bookkeeping lives in effect-local vars (never a ref read/write in render, never
// set-state-in-effect). The subscription is torn down + re-created when activeKey changes, and
// its pending debounce timer is cleared on cleanup (so a session switch cancels a stale capture).

import { useEffect } from 'react';
import { dequal } from 'dequal';
import { useSnapshotStore } from '@/stores/snapshot-store';
import { useEditHistoryStore } from '@/stores/edit-history-store';
import { selectItemSubtree } from '@/stores/edit-history-store/item-key';
import { SETTLE_MS } from '@/stores/edit-history-store/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useEditHistoryCapture');

/** Coarse v1 label (unresolved #4) — refine to per-owned-key deltas later if telemetry needs it. */
function inferLabel(): string {
  return 'edit';
}

export function useEditHistoryCapture(): void {
  const activeKey = useEditHistoryStore((s) => s.activeKey);
  const capture = useEditHistoryStore((s) => s.capture);

  useEffect(() => {
    if (!activeKey) return;
    const key = activeKey;
    log.debug('subscribe', 'attach capture subscription', { key });

    // Gesture bookkeeping (effect-local — never a ref in render).
    let pendingPrev: unknown = null;
    let hasPending = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = (): void => {
      timer = null;
      if (!hasPending) return;
      const prev = pendingPrev;
      hasPending = false;
      pendingPrev = null;
      capture(key, prev, inferLabel());
    };

    const unsubscribe = useSnapshotStore.subscribe(
      (state) => selectItemSubtree(state, key),
      (next, prev) => {
        // Skip an undo/redo apply (else the restore is re-captured) …
        if (useEditHistoryStore.getState().isApplyingHistory) return;
        // … and a realtime content-sync merge (a peer's edit is not a local undo step).
        if (useSnapshotStore.getState().isApplyingRemotePatch) return;
        // Redundant with the equalityFn but belt-and-suspenders against a same-value fire.
        if (dequal(prev, next)) return;

        if (!hasPending) {
          // First change of the gesture → remember the PRE-gesture sub-tree (owned clone).
          pendingPrev = structuredClone(prev);
          hasPending = true;
        }
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, SETTLE_MS);
      },
      { equalityFn: dequal },
    );

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      log.debug('subscribe', 'detach capture subscription', { key });
    };
  }, [activeKey, capture]);
}
