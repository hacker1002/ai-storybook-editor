// collab-image-save-helper.ts — SHARED acquire → save(node) → release skeleton for
// per-resource illustration/retouch collab saves (ADR-044). ONE image resource op
// (generate / edit / upload) = one lock lifecycle through the gateway `POST /api/resource/save`.
//
// Reused by BOTH image-task-slice (illustration entities + scene — P02) AND the retouch
// wiring (P03). DO NOT copy this logic — import it.
//
// Toast-free by design: the CALLER owns the UX on a 'skipped'/'failed' outcome (illustration
// toasts "another editor is editing"; retouch may toast a 403 access message). This helper only
// drives lock → save → release and reports the outcome.
//
// resource-lock-store is loaded by snapshot-store/index BEFORE the slices, so this static import
// resolves cleanly in the app. Isolated unit tests import this module directly and mock
// '@/stores/resource-lock-store' to break the slice ↔ store module cycle (the useResourceLockStore
// binding is only READ at call time, never at module-eval time — so the cycle is harmless).

import {
  useResourceLockStore,
  keyOf,
  FALLBACK_HOLDER_NAME,
  type LockTarget,
  type ResourceType,
  type SavePayload,
} from '@/stores/resource-lock-store';
import type { ImageTaskEntityType } from '@/stores/snapshot-store/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'CollabImageSaveHelper');

/** Outcome of a per-resource collab save.
 *  - 'saved'     → gateway wrote the node under the held lock.
 *  - 'skipped'   → acquire returned 409 (another editor holds the lock); NOTHING written.
 *  - 'forbidden' → save returned 403 (actor lacks access to this resource type — e.g. a
 *                  retouch-only collaborator saving a step=2 illustration node). EXPECTED
 *                  access-gate outcome the caller surfaces distinctly (illustration-access toast).
 *  - 'failed'    → save rejected (lock/node lost 409/404, transient) OR node missing.
 *  Additive member (2026-07-09, Track C): existing callers that only branch on
 *  'skipped'/'failed' keep working — a 'forbidden' outcome falls through their generic path. */
export type ImageSaveOutcome = 'saved' | 'skipped' | 'failed' | 'forbidden';

/** ImageTaskEntityType → gateway `resource_type` (1 image · 3 character · 4 prop · 5 stage).
 *  Entities lock their WHOLE node (rtype 3/4/5); scene + retouch images lock the leaf image (rtype 1). */
export const ENTITY_TYPE_TO_RESOURCE_TYPE: Record<ImageTaskEntityType, ResourceType> = {
  character: 3,
  prop: 4,
  stage: 5,
  illustration_image: 1, // scene raw image  → illustration.spreads[].raw_images[]
  retouch_image: 1, //       retouch image → illustration.spreads[].images[]
};

/** Entity kinds lock the WHOLE entity node → resource_id = entity key (not the child/variant). */
const ENTITY_KINDS: ReadonlySet<ImageTaskEntityType> = new Set(['character', 'prop', 'stage']);

/**
 * Build the step=2 LockTarget for an image resource (child resolver).
 * - character/prop/stage → lock the entity node, resource_id = `entityKey`.
 * - illustration_image / retouch_image → lock the leaf image, resource_id = `childKey`.
 * step is ALWAYS 2 (illustration/retouch phase) and locale ALWAYS null (language-agnostic).
 */
export function resolveImageLockTarget(
  entityType: ImageTaskEntityType,
  entityKey: string,
  childKey: string,
): LockTarget {
  return {
    step: 2,
    resource_type: ENTITY_TYPE_TO_RESOURCE_TYPE[entityType],
    resource_id: ENTITY_KINDS.has(entityType) ? entityKey : childKey,
    locale: null,
  };
}

/** Imperative twin of the `useLockHolderName` selector (usable OUTSIDE React) — display name of
 *  the current OTHER holder of `target`, or FALLBACK when unknown. Used by the caller to name the
 *  editor in a "your change was not saved" toast after a 'skipped' outcome. */
export function resolveLockHolderName(target: LockTarget): string {
  const s = useResourceLockStore.getState();
  if (!s.bookId) return FALLBACK_HOLDER_NAME;
  const holderId = s.registry.get(keyOf(s.bookId, target))?.holder_user_id;
  if (!holderId) return FALLBACK_HOLDER_NAME;
  return s.holderNames.get(holderId) ?? FALLBACK_HOLDER_NAME;
}

/**
 * Acquire the resource lock, patch ONE node through the gateway save, then ALWAYS release.
 *
 * @param target     step=2 lock target (from `resolveImageLockTarget`)
 * @param patch      the FULL fresh node body to persist. Caller MUST read it via getState() at
 *                   call time (never a task-creation closure var) to avoid stale-closure writes.
 *                   `null`/`undefined` (node deleted mid-flight) → bail 'failed' (no lock churn).
 * @param actionType crud audit enum: 3 edit · 5 upload/generate
 * @param targetRef  audit ref, identifying keys only (e.g. { spread_id, image_id } | { kind, entity })
 * @returns 'saved' | 'skipped' (409 acquire) | 'failed' (save rejected / node missing)
 *
 * `log: true` → the gateway emits the node-scope content-sync event + a single audit row (no client
 * summary log needed). NEVER throws — acquire/save/release all return result objects, and any
 * unexpected error is caught → 'failed', so a fire-and-forget caller (`void …`) can't reject.
 */
export async function saveImageResourceUnderLock(
  target: LockTarget,
  patch: unknown,
  actionType: SavePayload['action_type'],
  targetRef?: Record<string, unknown>,
): Promise<ImageSaveOutcome> {
  if (patch == null) {
    log.warn('saveImageResourceUnderLock', 'node missing at save time — bail', {
      type: target.resource_type,
      id: target.resource_id,
    });
    return 'failed';
  }

  const rl = useResourceLockStore.getState();
  log.info('saveImageResourceUnderLock', 'acquire', {
    type: target.resource_type,
    id: target.resource_id,
    action: actionType,
  });

  try {
    const acq = await rl.acquire(target);
    if (!acq.ok) {
      log.debug('saveImageResourceUnderLock', 'blocked — another editor holds the lock', {
        type: target.resource_type,
        id: target.resource_id,
      });
      return 'skipped'; // no lock held → nothing to release
    }
    try {
      const res = await rl.save(target, {
        action_type: actionType,
        patch,
        target_ref: targetRef,
        log: true,
      });
      if (res.ok) {
        log.info('saveImageResourceUnderLock', 'saved', {
          type: target.resource_type,
          id: target.resource_id,
        });
        return 'saved';
      }
      if (res.forbidden) {
        log.warn('saveImageResourceUnderLock', 'forbidden — missing resource access', {
          type: target.resource_type,
          id: target.resource_id,
        });
        return 'forbidden';
      }
      log.warn('saveImageResourceUnderLock', 'save rejected', {
        type: target.resource_type,
        id: target.resource_id,
        lost: res.lost,
      });
      return 'failed';
    } finally {
      await rl.release(target); // release ASAP so others can edit
    }
  } catch (err) {
    log.error('saveImageResourceUnderLock', 'unexpected error', {
      type: target.resource_type,
      id: target.resource_id,
      error: err instanceof Error ? err.message : String(err),
    });
    return 'failed';
  }
}
