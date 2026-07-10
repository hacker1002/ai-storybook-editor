// edit-history-store/apply-item-snapshot.ts — route a captured snapshot back into the
// snapshot store (ADR-045). Guard-agnostic: the CALLER (undo/redo) wraps this in
// `isApplyingHistory` so the resulting subtree change does not re-trigger capture. Kept
// dependency-free of the store `index.ts` to avoid a circular import.
//
// CRITICAL apply semantics (mirror the backend `apply_snapshot_subtree`):
//   • entity (grain 'node')     → REPLACE the whole node at [idx].
//   • scene/retouch ('subtree') → MERGE each OWNED key present in the payload into
//     spreads[idx]; keys ABSENT from the payload are NO-OPed (so `id` + the SIBLING pipeline's
//     keys are preserved). NEVER whole-replace the spread node (that would wipe the other
//     pipeline). Each restored value is structuredClone'd so the live store never aliases a
//     history entry (a later edit must not mutate a past/future snapshot).

import { useSnapshotStore } from '@/stores/snapshot-store';
import { createLogger } from '@/utils/logger';
import { resolveItemAddress } from './item-key';

const log = createLogger('Store', 'EditHistoryApply');

export function applyItemSnapshot(key: string, payload: unknown): void {
  const snap = useSnapshotStore.getState();
  const addr = resolveItemAddress(snap, key);
  if (!addr) {
    log.warn('applyItemSnapshot', 'unresolved key — skip', { key });
    return;
  }

  if (addr.grain === 'node') {
    // Entity: whole-node replace (restores the version-stack + is_selected).
    snap.replaceNodeById(addr.column, addr.path, structuredClone(payload));
    log.info('applyItemSnapshot', 'applied whole-node', { column: addr.column, pathLen: addr.path.length });
    return;
  }

  // Scene / retouch: owned-key MERGE (preserve sibling pipeline + id).
  const source = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const ownedKeys = addr.ownedKeys ?? [];
  let applied = 0;
  for (const k of ownedKeys) {
    if (k in source) {
      snap.replaceNodeById(addr.column, [...addr.path, k], structuredClone(source[k]));
      applied++;
    }
  }
  log.info('applyItemSnapshot', 'merged owned subtree', { column: addr.column, appliedKeys: applied });
}
