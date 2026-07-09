// collab-entity-save-helper.ts — DORMANT per-resource collab save seam for the three
// ENTITY spaces (characters / props / stages — rtype 3/4/5, ADR-044 / P04b wire-only).
//
// Every entity mutator (name/variant/voice/sound metadata edit, add-entity create,
// delete-entity, reorder-entity) patches WITHIN ONE entity node, which the gateway save
// already treats as a whole (resource_id = entity key). This seam is the ONE place that
// reads the fresh node + drives the gateway lifecycle so the 3 entity slices don't repeat
// it at every call site (DRY). It mirrors image-task-slice's `persistIllustrationCollab`,
// specialized to the entity-node grain.
//
// NO-OP under the solo path (`collabPersist=false`): the whole-doc autosave owns
// persistence there, so the solo path stays byte-identical. DORMANT until an illustration
// entity space flips collab-on (deferred follow-up) — every function early-returns now.
//
// Fire-and-forget from the slice mutators (`void …`) — none of these throw (each drives
// acquire → save → release inside a try/catch). The node is read FRESH via `get()` at call
// time (post-mutate) — never a mutator-closure var — to avoid a stale-closure write.

import { useResourceLockStore } from '@/stores/resource-lock-store';
import { reorderResource } from '@/apis/resource-lock-api';
import type { SnapshotStore } from '../types';
import {
  saveImageResourceUnderLock,
  resolveImageLockTarget,
  resolveLockHolderName,
} from './collab-image-save-helper';
import { toastLockedByOther } from '@/utils/collab-save-toasts';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'CollabEntitySaveHelper');

/** Entity kinds handled at the whole-node grain (subset of ImageTaskEntityType). */
export type EntityKind = 'character' | 'prop' | 'stage';

/** crud audit enum for the entity node-scope saves (see SavePayload): 2 create · 3 edit. */
export type EntityNodeActionType = 2 | 3;

/** Read the WHOLE entity node fresh (anti stale-closure) — null when deleted mid-flight. */
function readEntityNode(state: SnapshotStore, kind: EntityKind, key: string): unknown | null {
  switch (kind) {
    case 'character':
      return state.characters.find((c) => c.key === key) ?? null;
    case 'prop':
      return state.props.find((p) => p.key === key) ?? null;
    case 'stage':
      return state.stages.find((s) => s.key === key) ?? null;
    default:
      return null;
  }
}

/** Read the full ORDERED key list of an entity column (the reorder `ordered_ids` body). */
function readEntityKeys(state: SnapshotStore, kind: EntityKind): string[] {
  switch (kind) {
    case 'character':
      return state.characters.map((c) => c.key);
    case 'prop':
      return state.props.map((p) => p.key);
    case 'stage':
      return state.stages.map((s) => s.key);
    default:
      return [];
  }
}

/**
 * NODE-scope save (create `action_type` 2 | edit `action_type` 3): AFTER the local
 * optimistic mutate, patch the WHOLE entity node through the gateway under a lock. The
 * gateway emits a `scope:'node'` content-sync event + one audit row. NO-OP under solo.
 *
 * Covers: add-entity (create) + every metadata/variant/voice/sound edit (edit) — they all
 * land inside the same entity node, so a whole-node re-patch is the exact op.
 */
export async function persistEntityCollab(
  get: () => SnapshotStore,
  kind: EntityKind,
  key: string,
  actionType: EntityNodeActionType,
): Promise<void> {
  const collab = useResourceLockStore.getState().collabPersist;
  if (!collab) {
    log.debug('persistEntityCollab', 'solo path — whole-doc autosave owns persistence', { kind });
    return; // solo path UNCHANGED
  }

  const target = resolveImageLockTarget(kind, key, key); // entity node: resource_id = entity key
  const node = readEntityNode(get(), kind, key); // FRESH via getState()
  if (!node) {
    log.warn('persistEntityCollab', 'node missing at save time — skip gateway save', { kind, key });
    return;
  }

  log.info('persistEntityCollab', 'collab save', {
    kind,
    resourceType: target.resource_type,
    action: actionType,
  });
  const outcome = await saveImageResourceUnderLock(target, node, actionType, { kind, entity: key });
  if (outcome === 'skipped') {
    log.info('persistEntityCollab', 'skipped — locked by another editor', { kind, key });
    toastLockedByOther(resolveLockHolderName(target));
  } else if (outcome === 'failed') {
    log.warn('persistEntityCollab', 'collab save failed', { kind, key });
  }
}

/**
 * COLLECTION-scope DELETE (`action_type` 4, patch `null` → gateway removes the node and
 * `#-`-shifts siblings, emitting a `scope:'collection'` sync). AFTER the local delete,
 * persist the removal under a lock. NO-OP under solo.
 *
 * Distinct from `persistEntityCollab` because the shared image save helper bails on a null
 * patch (its "node deleted mid-flight" guard), so a delete drives the lifecycle here.
 */
export async function persistEntityDeleteCollab(kind: EntityKind, key: string): Promise<void> {
  const rl = useResourceLockStore.getState();
  if (!rl.collabPersist) {
    log.debug('persistEntityDeleteCollab', 'solo path — whole-doc autosave owns persistence', { kind });
    return; // solo path UNCHANGED
  }

  const target = resolveImageLockTarget(kind, key, key);
  log.info('persistEntityDeleteCollab', 'collab delete', { kind, resourceType: target.resource_type });
  try {
    const acq = await rl.acquire(target);
    if (!acq.ok) {
      log.info('persistEntityDeleteCollab', 'skipped — locked by another editor', { kind, key });
      toastLockedByOther(resolveLockHolderName(target));
      return; // no lock held → nothing to release
    }
    try {
      const res = await rl.save(target, {
        action_type: 4,
        patch: null,
        target_ref: { kind, entity: key },
        log: true,
      });
      if (res.ok) {
        log.info('persistEntityDeleteCollab', 'deleted', { kind, key });
      } else {
        log.warn('persistEntityDeleteCollab', 'delete save rejected', { kind, key, lost: res.lost });
      }
    } finally {
      await rl.release(target);
    }
  } catch (err) {
    log.error('persistEntityDeleteCollab', 'unexpected error', {
      kind,
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * COLLECTION-scope REORDER (order permutation → `scope:'collection'`). AFTER the local
 * reorder, persist the new order via `/api/resource/reorder` under a lock. NO-OP under solo.
 *
 * ⚠️ BACKEND-GATED: `/api/resource/reorder` currently supports only step=1 / type=6 (sketch
 * spreads); an entity reorder (step=2, type 3/4/5) will 422 UNSUPPORTED until the endpoint is
 * extended. This is dormant now (collab off) → completely inert; it is wire-only readiness for
 * the deferred flip. Before an entity space flips, the reorder endpoint MUST gain step=2/
 * type-3/4/5 support (and its entity-reorder lock model confirmed). On a save failure we log
 * only (no local revert) — a later content-sync/refetch reconciles the order.
 */
export async function persistEntityReorderCollab(
  get: () => SnapshotStore,
  kind: EntityKind,
  draggedKey: string,
  from: number,
  to: number,
): Promise<void> {
  const rl = useResourceLockStore.getState();
  if (!rl.collabPersist) {
    log.debug('persistEntityReorderCollab', 'solo path — whole-doc autosave owns persistence', { kind });
    return; // solo path UNCHANGED
  }
  const bookId = rl.bookId;
  if (!bookId) {
    log.warn('persistEntityReorderCollab', 'no bookId — skip reorder save', { kind });
    return;
  }

  const target = resolveImageLockTarget(kind, draggedKey, draggedKey);
  const orderedIds = readEntityKeys(get(), kind); // post-mutate order (FRESH via getState())
  log.info('persistEntityReorderCollab', 'collab reorder', { kind, count: orderedIds.length });
  try {
    const acq = await rl.acquire(target);
    if (!acq.ok) {
      log.info('persistEntityReorderCollab', 'skipped — locked by another editor', { kind });
      toastLockedByOther(resolveLockHolderName(target));
      return;
    }
    try {
      const res = await reorderResource({
        bookId,
        step: target.step,
        resourceType: target.resource_type,
        resourceId: draggedKey,
        orderedIds,
        // 1-based to match the audit ordinal convention used by the sketch-spread reorder.
        targetRef: { from: from + 1, to: to + 1 },
      });
      if (res.ok) {
        log.info('persistEntityReorderCollab', 'reordered', { kind });
      } else {
        log.warn('persistEntityReorderCollab', 'reorder failed', { kind, code: res.code });
      }
    } finally {
      await rl.release(target);
    }
  } catch (err) {
    log.error('persistEntityReorderCollab', 'unexpected error', {
      kind,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
