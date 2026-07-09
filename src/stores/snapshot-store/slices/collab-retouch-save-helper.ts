// collab-retouch-save-helper.ts — DORMANT per-resource collab save seam for the OBJECTS/RETOUCH
// space (step=2 illustration playable overlays — ADR-044 P06 wire-only).
//
// Backend collapse: EVERY objects/retouch node kind (video / auto_pic / audio / auto_audio /
// composite / quiz) is addressed by ONE GENERIC resource_type 9 at step=2. The ONLY per-kind
// difference is the `collection` string (the owning `spreads[].<collection>[]` array) sent on a
// nested CREATE. EDIT/DELETE address the node by id alone — the backend scans by id, so NO
// parent_id/collection is sent. This mirrors the backend's own single-rtype collapse (P06-BE).
//
// Sibling of `collab-scene-save-helper.ts` (scene overlays rtype 6/1/7/8) and
// `collab-entity-save-helper.ts` (entities rtype 3/4/5) — same acquire → save(node) → release
// lifecycle via the shared `saveImageResourceUnderLock`, kept separate to hold the objects grain.
//
// NO-OP under solo (`collabPersist=false`): the whole-doc autosave owns persistence there, so the
// solo path stays byte-identical. DORMANT until the objects space flips collab-on (P07).
//
// NOTE — `animations` has NO stable node `id` (only `target.id`; the snapshot schema mints no
// animation id) → it CANNOT be per-node rtype-9-addressed. It is instead persisted as a WHOLE
// ARRAY keyed by its parent SPREAD via `persistAnimationsCollectionCollab` (below): the backend
// switches to whole-array-replace mode when `collection` is set AND `patch` is a LIST. That is why
// `animations` is EXCLUDED from `RetouchCollection` (the per-node vocabulary) but is still wired.
//
// Fire-and-forget from the slice mutators (`void …`); none throw (each drives the lifecycle in a
// try/catch). The node is read FRESH via `get()` at call time (post-mutate) — never a mutator
// closure var — to avoid a stale-closure write.

import { useResourceLockStore } from '@/stores/resource-lock-store';
import type { LockTarget } from '@/stores/resource-lock-store';
import type { SnapshotStore } from '../types';
import {
  saveImageResourceUnderLock,
  resolveLockHolderName,
  type ImageSaveOutcome,
} from './collab-image-save-helper';
import { toastLockedByOther, toastForbiddenIllustration } from '@/utils/collab-save-toasts';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'CollabRetouchSaveHelper');

/** Generic gateway resource_type for EVERY objects/retouch node kind (backend rtype collapse). */
const RETOUCH_RESOURCE_TYPE = 9 as const;

/** crud audit enum for objects/retouch node-scope saves: 2 create · 3 edit. */
export type RetouchNodeActionType = 2 | 3;

/** The `spreads[].<collection>[]` arrays addressed by rtype 9. `animations` is EXCLUDED — it has no
 *  stable node id, so it is not rtype-9-addressable (see file header + id-stability gate). */
export type RetouchCollection =
  | 'videos'
  | 'auto_pics'
  | 'audios'
  | 'auto_audios'
  | 'composites'
  | 'quizzes';

/** Whether collab persistence is active. Solo path (false) → all helpers below no-op. */
function isCollab(): boolean {
  return useResourceLockStore.getState().collabPersist;
}

/** Build the step=2 / rtype=9 LockTarget for an objects/retouch node (language-agnostic). */
function retouchLockTarget(nodeId: string): LockTarget {
  return { step: 2, resource_type: RETOUCH_RESOURCE_TYPE, resource_id: nodeId, locale: null };
}

/** Read the WHOLE objects/retouch node fresh (anti stale-closure) — null when deleted mid-flight.
 *  All rtype-9 collections are arrays of `{ id: string }`, so the lookup is uniform. */
function readRetouchNode(
  state: SnapshotStore,
  spreadId: string,
  collection: RetouchCollection,
  nodeId: string,
): { id: string } | null {
  const spread = state.illustration.spreads.find((s) => s.id === spreadId);
  const arr = spread?.[collection] as ReadonlyArray<{ id: string }> | undefined;
  return arr?.find((n) => n.id === nodeId) ?? null;
}

/** Shared post-save outcome handling (DRY). `forbidden` is surfaced (log.warn + toast) — the SRS §8
 *  retouch-only-collaborator gate: a step=2 illustration write needs illustration access (owner
 *  bypasses at the gateway). NEVER silent. */
function reportSaveOutcome(
  outcome: ImageSaveOutcome,
  target: LockTarget,
  ctx: Record<string, unknown>,
): void {
  if (outcome === 'skipped') {
    log.info('reportSaveOutcome', 'skipped — locked by another editor', ctx);
    toastLockedByOther(resolveLockHolderName(target));
  } else if (outcome === 'forbidden') {
    log.warn('reportSaveOutcome', 'forbidden — missing illustration access', ctx);
    toastForbiddenIllustration();
  } else if (outcome === 'failed') {
    log.warn('reportSaveOutcome', 'collab save failed', ctx);
  }
}

/**
 * NODE-scope save of an objects/retouch node (create 2 | edit 3), rtype 9. On a CREATE the gateway
 * appends a BRAND-NEW node under `spreads[<spreadId>].<collection>[]` (parent_id + collection sent);
 * on an EDIT it re-patches the whole node addressed by id (no parent_id/collection). NO-OP solo.
 */
export async function persistRetouchNodeCollab(
  get: () => SnapshotStore,
  params: {
    spreadId: string;
    nodeId: string;
    collection: RetouchCollection;
    actionType: RetouchNodeActionType;
  },
): Promise<void> {
  const { spreadId, nodeId, collection, actionType } = params;
  if (!isCollab()) {
    log.debug('persistRetouchNodeCollab', 'solo path — whole-doc autosave owns persistence', { spreadId, collection });
    return;
  }
  const node = readRetouchNode(get(), spreadId, collection, nodeId);
  if (!node) {
    log.warn('persistRetouchNodeCollab', 'node missing at save time — skip gateway save', { spreadId, collection, nodeId });
    return;
  }
  const target = retouchLockTarget(nodeId);
  log.info('persistRetouchNodeCollab', 'collab save', { resourceType: target.resource_type, collection, action: actionType });
  const outcome = await saveImageResourceUnderLock(
    target,
    node,
    actionType,
    { spread_id: spreadId, node_id: nodeId, collection },
    // Nested CREATE → gateway appends under the spread's array; EDIT sends neither field.
    actionType === 2 ? { parentId: spreadId, collection } : undefined,
  );
  reportSaveOutcome(outcome, target, { spreadId, collection, nodeId });
}

/**
 * COLLECTION-scope DELETE of an objects/retouch node (`action_type` 4, patch `null`), rtype 9. The
 * backend removes the node addressed by id alone (it scans by id — no parent_id/collection). The
 * `collection` is carried in the audit ref only. NO-OP solo.
 */
export async function persistRetouchDeleteCollab(
  spreadId: string,
  nodeId: string,
  collection: RetouchCollection,
): Promise<void> {
  if (!isCollab()) {
    log.debug('persistRetouchDeleteCollab', 'solo path — whole-doc autosave owns persistence', { spreadId, collection });
    return;
  }
  const target = retouchLockTarget(nodeId);
  const targetRef = { spread_id: spreadId, node_id: nodeId, collection };
  const rl = useResourceLockStore.getState();
  log.info('persistRetouchDeleteCollab', 'collab delete', { spreadId, collection, nodeId });
  try {
    const acq = await rl.acquire(target);
    if (!acq.ok) {
      log.info('persistRetouchDeleteCollab', 'skipped — locked by another editor', targetRef);
      toastLockedByOther(resolveLockHolderName(target));
      return; // no lock held → nothing to release
    }
    try {
      const res = await rl.save(target, { action_type: 4, patch: null, target_ref: targetRef, log: true });
      if (res.ok) {
        log.info('persistRetouchDeleteCollab', 'deleted', targetRef);
      } else if (res.forbidden) {
        log.warn('persistRetouchDeleteCollab', 'forbidden — missing illustration access', targetRef);
        toastForbiddenIllustration();
      } else {
        log.warn('persistRetouchDeleteCollab', 'delete save rejected', { ...targetRef, lost: res.lost });
      }
    } finally {
      await rl.release(target);
    }
  } catch (err) {
    log.error('persistRetouchDeleteCollab', 'unexpected error', {
      ...targetRef,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Whole-array collection owned by `persistAnimationsCollectionCollab` — NOT a member of
 *  `RetouchCollection` because animations have no per-node id (see file header). */
const ANIMATIONS_COLLECTION = 'animations' as const;

/**
 * WHOLE-ARRAY save of a spread's `animations` (edit 3, rtype 9). Unlike the per-node retouch
 * collections, `SpreadAnimation` carries NO stable node id, so the backend replaces the ENTIRE
 * `spreads[<spreadId>].animations` array in one write — keyed by the parent SPREAD
 * (`resource_id = parent_id = spreadId`, `collection = 'animations'`, `patch = the full array`).
 * The gateway switches to whole-array mode precisely because `collection` is set AND `patch` is a
 * LIST. Fire this AFTER any animation mutation (add / update / delete / deleteByTargetId / reorder).
 *
 * The array is read FRESH via `get()` post-mutate (anti stale-closure). An empty array (last
 * animation removed) is a valid patch and IS persisted; only a missing spread or no bookId bails.
 * NO-OP solo — the whole-doc autosave owns persistence there. Mirrors `persistRetouchNodeCollab`
 * (shared acquire → save → release via `saveImageResourceUnderLock` + `reportSaveOutcome`).
 */
export async function persistAnimationsCollectionCollab(
  get: () => SnapshotStore,
  spreadId: string,
): Promise<void> {
  if (!isCollab() || !useResourceLockStore.getState().bookId) {
    log.debug('persistAnimationsCollectionCollab', 'solo path — whole-doc autosave owns persistence', { spreadId });
    return;
  }
  const spread = get().illustration.spreads.find((s) => s.id === spreadId);
  if (!spread) {
    log.warn('persistAnimationsCollectionCollab', 'spread missing at save time — skip gateway save', { spreadId });
    return;
  }
  const animations = spread.animations ?? [];
  const target = retouchLockTarget(spreadId); // resource_id = the owning spread
  log.info('persistAnimationsCollectionCollab', 'collab save (whole animations array)', {
    resourceType: target.resource_type,
    collection: ANIMATIONS_COLLECTION,
    count: animations.length,
  });
  const outcome = await saveImageResourceUnderLock(
    target,
    animations, // patch = the FULL array → triggers backend whole-array-replace mode
    3, // edit (whole-array replace)
    { spread_id: spreadId, collection: ANIMATIONS_COLLECTION },
    // parent_id = the owning spread (same id as resource_id here); collection selects the array.
    { parentId: spreadId, collection: ANIMATIONS_COLLECTION },
  );
  reportSaveOutcome(outcome, target, { spreadId, collection: ANIMATIONS_COLLECTION, count: animations.length });
}
