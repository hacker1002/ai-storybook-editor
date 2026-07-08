// structural-lock-delete.ts — shared acquire → local-delete → save(action=4) →
// release skeleton for the TWO sidebar structural deletes (spread type-6, entity
// type 3/4/5). Both follow the same lifecycle; the per-resource CHILD-LOCK GUARD is
// the CALLER's responsibility (spread scans images+textboxes; entity is a simple
// `isLockedByOtherNow`) and runs BEFORE this — a passed guard is a precondition here.
//
// Imperative store access (getState): this drives the lock lifecycle, it does not
// render off store state.

import { toast } from 'sonner';
import {
  useResourceLockStore,
  FALLBACK_HOLDER_NAME,
  type LockTarget,
  type SavePayload,
} from '@/stores/resource-lock-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'StructuralLockDelete');

/**
 * Acquire the structural lock, apply the optimistic LOCAL delete, persist it via the
 * gateway `save` (action_type 4), then always release. On acquire-block a holder-named
 * toast is shown and NOTHING is deleted. On save-fail the local delete is KEPT
 * (mirrors the editor's save-lost semantics — a re-fetch reconciles) and an error toast
 * is shown.
 *
 * @param target          the structural lock target (spread type-6 / entity type 3-5)
 * @param save            action_type:4 delete payload (patch null; target_ref for audit)
 * @param applyLocalDelete removes the node from the snapshot store + clears local UI selection
 */
export async function runLockedDelete(
  target: LockTarget,
  save: SavePayload,
  applyLocalDelete: () => void,
): Promise<void> {
  const store = useResourceLockStore.getState();
  log.info('runLockedDelete', 'acquire', {
    type: target.resource_type,
    id: target.resource_id,
  });

  const acq = await store.acquire(target);
  if (!acq.ok) {
    const name = acq.holder
      ? store.holderNames.get(acq.holder) ?? FALLBACK_HOLDER_NAME
      : FALLBACK_HOLDER_NAME;
    log.info('runLockedDelete', 'blocked on acquire — another editor holds it', {
      type: target.resource_type,
      hasHolder: !!acq.holder,
    });
    toast.info(`${name} đang chỉnh sửa — vui lòng thử lại sau.`);
    return;
  }

  try {
    applyLocalDelete();
    const res = await store.save(target, save);
    if (!res.ok) {
      log.warn('runLockedDelete', 'save failed after local delete', {
        type: target.resource_type,
        lost: res.lost,
      });
      toast.error('Không lưu được thao tác xoá — vui lòng tải lại trang.');
    } else {
      log.info('runLockedDelete', 'deleted', { type: target.resource_type, id: target.resource_id });
    }
  } finally {
    await store.release(target);
  }
}
