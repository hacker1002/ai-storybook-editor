// collab-sketch-stage-save-helper.ts — per-resource collab save seam for the SKETCH STAGES
// creative space (9th collab space, ADR-043 lineage). ONE grain only: the WHOLE stage node at
// STEP 1 / rtype 5, which the gateway resolver maps to `sketch.stages[key]` — base.styles[] AND
// every variant live INSIDE that node, so a single lock covers the entire stage (no new rtype,
// unlike the base space's rtype 11; the derived variants[base] clone is the SAME node → no
// second lock, no contention).
//
// Mirror of collab-sketch-variant-save-helper.ts with the kind dimension removed (stages are
// keyed by stageKey alone). Three consumers (batch-at-release model, ADR-043 Rev 2026-07-16):
//   • the component held-session (use-stage-lock-session) — cheap edits (text / pick / crop edit)
//     mutate the store under the hold; the session saves the whole node ONCE at release.
//   • the STAGE JOB slice (off-render) — flush-before-generate (API 12 is snapshot-reading) +
//     persist-after for every generate/re-cut chain (AI output must not wait for a release).
//   • `handleSelectCrop` (space root) — single-gesture pick whose held-session baseline is
//     captured too late to see it (H2) → direct flush, `releaseIfAcquired` default FALSE.
//
// NO-OP under solo (`collabPersist=false`): the whole-doc autosave owns persistence there.
// This module does NOT import snapshot-store (caller reads the fresh node) → no cycle.

import { useResourceLockStore, keyOf, type LockTarget } from '@/stores/resource-lock-store';
import { toastLockedByOther } from '@/utils/collab-save-toasts';
import { resolveLockHolderName } from './collab-image-save-helper';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'CollabSketchStageSaveHelper');

/** Gateway resource_type for a sketch stage node — resolver `(step=1, rtype=5) → sketch.stages[key]`
 *  pre-exists in 04-save. ⚠️ Authz: the `stages` grant key exists under BOTH the sketch AND the
 *  illustration step → backend `assert_access_rights` must pin `steps.sketch.resources.stages`
 *  (verify in the 2-tab smoke — memory *rtype-authz-step-pin*). */
const STAGE_RESOURCE_TYPE = 5 as const;

/** crud audit enum: 3 = edit (stage nodes always pre-exist — seeded by import; the space never
 *  creates/deletes a stage). */
const ACTION_TYPE_EDIT = 3 as const;

/** STEP-1 LockTarget for one stage node (whole-node grain, not locale-scoped). */
export function resolveSketchStageLockTarget(stageKey: string): LockTarget {
  return { step: 1, resource_type: STAGE_RESOURCE_TYPE, resource_id: stageKey, locale: null };
}

/** Whole-node payload for the held-session `buildPayload` — `{action_type:3, patch, log:true}`
 *  (`log:true` emits the scope:'node' content-sync event so peers refetch the fresh node). */
export function buildSketchStagePayload(node: unknown): {
  action_type: 3;
  patch: unknown;
  log: true;
} {
  return { action_type: ACTION_TYPE_EDIT, patch: node, log: true };
}

export interface FlushSketchStageOptions {
  /**
   * ⚠️ One-shot semantics — copy of the variant helper's contract, same hazard: if THIS call had
   * to `acquire` (the held-session did NOT own the stage), release after the save. Use ONLY for
   * persists that may run OUTSIDE the held-session's ownership window (persist-after a long AI
   * call the user browsed away from; the H2 select-crop gesture). When the stage IS already held,
   * the lock is KEPT — the held-session stays the sole releaser. Default `false` (flush-BEFORE-
   * generate: the caller just adopted the stage, so the held-session owns + will release it).
   * Setting `true` where the held-session still owns the stage would be harmless; setting it
   * where a WHOLE-SESSION release is expected would false-"Saved" — never flip the default.
   */
  releaseIfAcquired?: boolean;
}

/**
 * Persist the WHOLE stage node through the gateway. Baseline-independent (saves exactly the
 * fresh node the caller passes — no dirty-diff), so a late-baseline mutation can't be dropped.
 *
 * Lock lifecycle (mirror flushSketchEntityUnderLock):
 *   • solo → no-op, `true` (caller keeps autoSaveSnapshot).
 *   • already held → skip acquire, `save`, KEEP the lock.
 *   • not held → `acquire` (409 → toast + `false`); after the save, release IFF
 *     `releaseIfAcquired` (one-shot — never orphans a lock).
 *
 * @param node the FRESH whole stage node (read via getState() at call time). `null` → `false`.
 * @returns `true` when persisted (or solo no-op); `false` on 409 / save-reject / missing node.
 */
export async function flushSketchStageUnderLock(
  stageKey: string,
  node: unknown,
  opts?: FlushSketchStageOptions,
): Promise<boolean> {
  const rl = useResourceLockStore.getState();
  if (!rl.collabPersist) {
    log.debug('flushSketchStageUnderLock', 'solo path — whole-doc autosave owns persistence', { stageKey });
    return true;
  }
  if (node == null) {
    log.warn('flushSketchStageUnderLock', 'node missing at save time — skip', { stageKey });
    return false;
  }
  const bookId = rl.bookId;
  if (!bookId) {
    log.warn('flushSketchStageUnderLock', 'no book connected — skip', { stageKey });
    return false;
  }

  const target = resolveSketchStageLockTarget(stageKey);
  const key = keyOf(bookId, target);
  let acquiredHere = false;

  try {
    if (!rl.myLocks.has(key)) {
      const acq = await rl.acquire(target);
      if (!acq.ok) {
        log.info('flushSketchStageUnderLock', 'blocked — another editor holds the stage', { stageKey });
        toastLockedByOther(resolveLockHolderName(target));
        return false;
      }
      acquiredHere = true;
    }
    const res = await rl.save(target, buildSketchStagePayload(node));
    if (res.ok) {
      log.info('flushSketchStageUnderLock', 'saved', { stageKey, acquiredHere });
      return true;
    }
    log.warn('flushSketchStageUnderLock', 'save rejected', {
      stageKey,
      lost: res.lost,
      forbidden: res.forbidden,
    });
    if (res.forbidden) toastLockedByOther(resolveLockHolderName(target));
    return false;
  } catch (err) {
    log.error('flushSketchStageUnderLock', 'unexpected error', {
      stageKey,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    if (acquiredHere && opts?.releaseIfAcquired) {
      await rl.release(target);
      log.debug('flushSketchStageUnderLock', 'one-shot release (acquired here, not held-session owned)', {
        stageKey,
      });
    }
  }
}
