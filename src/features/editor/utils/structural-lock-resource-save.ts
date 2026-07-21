// structural-lock-resource-save.ts — acquire the coarse spread/entity structural lock →
// apply an optimistic LOCAL mutation → persist a SINGLE whole-node EDIT via the gateway
// `save` (action_type 3, a dict `patch`) → ALWAYS release. Sibling of
// `structural-lock-collection-save.ts` (whole-ARRAY collection save) and
// `structural-lock-delete.ts` (#- delete): same lock lifecycle, different gateway op.
//
// Consumer: the sketch-spread art-direction modal (rtype 6, step 1). `art_direction` lives
// on a spread PAGE (no per-page rtype), so the whole spread node is the finest addressable
// grain — addressing.py resolves step-1 rtype-6 to owned_keys=None → a whole-node jsonb_set
// replace (NOT the step-2 scene owned-key merge). Because the write carries the WHOLE node
// (images/textboxes too), the CALLER MUST guard concurrent child edits (image rtype-1 /
// textbox rtype-2 locks) before invoking — this helper owns only the lock+save lifecycle.
//
// Imperative store access (getState): drives the lock lifecycle; does not render off state.

import { toast } from 'sonner';
import {
  useResourceLockStore,
  FALLBACK_HOLDER_NAME,
  type LockTarget,
  type SavePayload,
} from '@/stores/resource-lock-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'StructuralLockResourceSave');

export type ResourceSaveOutcome = 'saved' | 'blocked' | 'failed';

/**
 * Acquire the structural lock, apply the optimistic LOCAL mutation, persist a single
 * whole-node EDIT via the gateway `save`, then ALWAYS release.
 *
 * - acquire blocked → NOTHING applied (applyLocal runs only after acquire), holder-named
 *   toast, returns 'blocked'.
 * - save failed → local mutation is KEPT (save-lost semantics — a refetch reconciles),
 *   returns 'failed' (caller decides the toast).
 * - ok → returns 'saved'.
 *
 * @param target     lock target (single resource — e.g. rtype 6 spread, resource_id = spread id)
 * @param save       single-node payload ({ action_type: 3, patch: <whole node dict>, target_ref })
 * @param applyLocal optimistic local snapshot-store mutation (mirrors the persisted patch)
 */
export async function runLockedResourceSave(
  target: LockTarget,
  save: SavePayload,
  applyLocal: () => void,
): Promise<ResourceSaveOutcome> {
  const store = useResourceLockStore.getState();
  log.info('runLockedResourceSave', 'acquire', {
    type: target.resource_type,
    id: target.resource_id,
    action: save.action_type,
  });

  const acq = await store.acquire(target);
  if (!acq.ok) {
    const name = acq.holder
      ? store.holderNames.get(acq.holder) ?? FALLBACK_HOLDER_NAME
      : FALLBACK_HOLDER_NAME;
    log.info('runLockedResourceSave', 'blocked on acquire — another editor holds it', {
      type: target.resource_type,
      hasHolder: !!acq.holder,
    });
    toast.info(`${name} đang chỉnh sửa — vui lòng thử lại sau.`);
    return 'blocked';
  }

  try {
    applyLocal();
    const res = await store.save(target, save);
    if (!res.ok) {
      log.warn('runLockedResourceSave', 'save failed after local apply', {
        type: target.resource_type,
        lost: res.lost,
      });
      return 'failed';
    }
    log.info('runLockedResourceSave', 'saved', { type: target.resource_type });
    return 'saved';
  } finally {
    await store.release(target);
  }
}
