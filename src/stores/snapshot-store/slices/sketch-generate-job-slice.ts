// sketch-generate-job-slice.ts — orchestrates SEQUENTIAL sketch entity-sheet generation.
// One job = N entities of a single kind, one API call per entity, run one-at-a-time.
// After each entity resolves: write entity.media_url (sketch-slice sets sync.isDirty)
// then fire autoSaveSnapshot() so the sheet is flushed to DB before the next entity — the
// UI fills in gradually and progress survives a reload. Partial failures never abort the job.
//
// Async rule (mirrors image-task-slice): runJob is a PLAIN async function (NOT inside an
// immer producer). Every mutation between awaits goes through a synchronous set((state)=>…)
// producer. After each await we re-read the job and bail if it was replaced/reset (race guard).

import type { StateCreator } from 'zustand';
import type { SnapshotStore, SketchGenerateJobSlice, SketchGenerateTask } from '../types';
import type { SketchEntityKind } from '@/types/sketch';
import { callGenerateSketchSheet } from '@/apis/sketch-sheet-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
// resource-lock-store is loaded by snapshot-store/index (line 6) BEFORE the slices, so this static
// import resolves cleanly in the app. The isolated slice unit tests import this module directly
// (bypassing index) and therefore mock '@/stores/resource-lock-store' to avoid the module cycle
// (slice → resource-lock-store → auth-store → snapshot-store/index → slice).
import {
  useResourceLockStore,
  FALLBACK_HOLDER_NAME,
  type LockTarget,
  type ResourceType,
} from '@/stores/resource-lock-store';
import {
  insertGenerateSummaryLog,
  ACTION_TYPE_UPLOAD,
  TARGET_TYPE_ENTITY,
} from '@/apis/activity-log-client';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SketchGenerateJobSlice');

/** Entity kind → lock `resource_type` (gateway enum: 3 character · 4 prop · 5 stage). */
const ENTITY_RESOURCE_TYPE: Record<SketchEntityKind, ResourceType> = {
  characters: 3,
  props: 4,
  stages: 5,
};

/** LockTarget for a whole sketch entity (language-agnostic → locale null). */
function entityLockTarget(kind: SketchEntityKind, key: string): LockTarget {
  return { step: 1, resource_type: ENTITY_RESOURCE_TYPE[kind], resource_id: key, locale: null };
}

// Backend error codes → user-facing English (mirrors ART_STYLE_ERROR_MESSAGES in image-task-slice).
// VALIDATION_ERROR here is a defensive net only — >12-variant / empty entities are client-filtered
// in the content-area (Validation S1) before enqueue, so a 400 should not normally reach here.
const SKETCH_ERROR_MESSAGES: Record<string, string> = {
  ART_STYLE_NOT_FOUND: 'Selected art style not found — please pick one again in settings.',
  ART_STYLE_NO_REFERENCES: 'This art style has no reference images — add some in Style settings.',
  VALIDATION_ERROR: 'Invalid sketch request — check the entity variants.',
  LLM_ERROR: 'The image model failed to generate this sheet — please try again.',
};

const SKIPPED_DELETED_MESSAGE = 'Skipped — entity was deleted';

/** Display name from a thin entity key (entities carry no `name`): `kid_hero` → `Kid Hero`.
 *  Duplicated (not imported) from the component layer to keep the store slice layering-clean. */
function titleCase(key: string): string {
  return key
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Maps an ImageApiFailure (or a non-success result) to a friendly message. */
function classifyError(result: { error?: string }): string {
  const code = (result as ImageApiFailure).errorCode;
  return (code && SKETCH_ERROR_MESSAGES[code]) || result.error || 'Sketch generation failed';
}

export const createSketchGenerateJobSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  SketchGenerateJobSlice
> = (set, get) => {
  // Sequential driver. Fire-and-forget from startSketchGenerateJob (never awaited by the action).
  async function runJob(jobId: string, kind: SketchEntityKind, artStyleId: string): Promise<void> {
    const initial = get().sketchGenerateJob;
    if (!initial || initial.id !== jobId) return;
    const taskCount = initial.tasks.length;

    // collabPersist = inside a sketch collab space (always true in practice). When true, every
    // write routes through the resource-lock gateway: per entity acquire → generate → save(log=false)
    // → release, and a SINGLE summary audit row at the end. When false (legacy solo path), keep the
    // owner-direct autoSaveSnapshot flow untouched (KISS — don't break non-collab callers).
    const resourceLock = useResourceLockStore.getState();
    const collab = resourceLock.collabPersist;
    const generatedKeys: string[] = []; // entities that produced a sheet this job (summary ref)

    for (let i = 0; i < taskCount; i++) {
      const job = get().sketchGenerateJob;
      if (!job || job.id !== jobId) return; // reset / replaced by a new job
      if (job.cancelRequested) break; // cancel = stop before the next entity

      const task = job.tasks[i];
      const entity = get().sketch[kind].find((e) => e.key === task.entityKey);

      if (!entity) {
        log.warn('runJob', 'entity deleted mid-job — skip', { jobId, entityKey: task.entityKey });
        set((state) => {
          const j = state.sketchGenerateJob;
          if (!j || j.id !== jobId) return;
          j.tasks[i].status = 'error';
          j.tasks[i].error = SKIPPED_DELETED_MESSAGE;
          j.tasks[i].completedAt = new Date().toISOString();
        });
        continue;
      }

      // ── collab: acquire the entity lock BEFORE generating. 409 (held by another) → SKIP this
      //    entity (do NOT abort the job) so we never clobber someone else's in-flight edit.
      const lockTarget = collab ? entityLockTarget(kind, task.entityKey) : null;
      if (lockTarget) {
        const acq = await resourceLock.acquire(lockTarget);
        if (get().sketchGenerateJob?.id !== jobId) {
          if (acq.ok) await resourceLock.release(lockTarget); // job replaced during acquire — clean up
          return;
        }
        if (!acq.ok) {
          log.info('runJob', 'entity locked by another editor — skip', {
            jobId,
            entityKey: task.entityKey,
            holder: acq.holder,
          });
          // Read holderNames FRESH (acquire's resolveHolderNames populates it async, after the
          // snapshot captured in `resourceLock`); falls back to the generic name if still unresolved.
          const holderName =
            useResourceLockStore.getState().holderNames.get(acq.holder) || FALLBACK_HOLDER_NAME;
          set((state) => {
            const j = state.sketchGenerateJob;
            if (!j || j.id !== jobId) return;
            j.skipped += 1;
            j.skippedNames.push(task.entityName);
            j.tasks[i].status = 'error';
            j.tasks[i].skipped = true;
            j.tasks[i].error = `Skipped — ${holderName} is editing`;
            j.tasks[i].completedAt = new Date().toISOString();
          });
          continue; // no lock held → nothing to release
        }
      }

      set((state) => {
        const j = state.sketchGenerateJob;
        if (!j || j.id !== jobId) return;
        j.currentIndex = i;
        j.tasks[i].status = 'running';
        j.tasks[i].startedAt = new Date().toISOString();
      });

      try {
        const result = await callGenerateSketchSheet(kind, {
          entityKey: task.entityKey,
          variants: entity.variants,
          artStyleId,
        });

        if (get().sketchGenerateJob?.id !== jobId) return; // race: job replaced (finally releases lock)
        if (!result.success || !result.data) throw new Error(classifyError(result));

        const url = result.data.imageUrl;
        log.info('runJob', 'entity sheet done', { jobId, entityKey: task.entityKey });

        set((state) => {
          const j = state.sketchGenerateJob;
          if (!j || j.id !== jobId) return;
          j.tasks[i].status = 'completed';
          j.tasks[i].imageUrl = url;
          j.tasks[i].completedAt = new Date().toISOString();
        });

        // Persist media_url onto the entity (sketch-slice sets sync.isDirty).
        get().setSketchEntityMediaUrl(kind, task.entityKey, url);
        generatedKeys.push(task.entityKey);

        if (lockTarget) {
          // collab: flush DATA-ONLY through the gateway under the held lock (replaces
          // autoSaveSnapshot). log:false → no per-target audit; the job writes one summary row.
          const node = get().sketch[kind].find((e) => e.key === task.entityKey) ?? null;
          const saveRes = await resourceLock.save(lockTarget, {
            action_type: ACTION_TYPE_UPLOAD,
            patch: node,
            target_ref: { kind, entity: task.entityKey },
            log: false,
          });
          if (get().sketchGenerateJob?.id !== jobId) return; // finally releases lock
          if (!saveRes.ok) {
            log.warn('runJob', 'entity save under lock failed — sheet may not persist', {
              jobId,
              entityKey: task.entityKey,
              lost: saveRes.lost,
            });
          }
        } else {
          // legacy solo path: fire-and-forget owner-direct autosave; self-guards on isSaving/!isDirty.
          void get().autoSaveSnapshot();
        }
      } catch (err) {
        if (get().sketchGenerateJob?.id === jobId) {
          const msg = err instanceof Error ? err.message : 'Sketch generation failed';
          log.error('runJob', 'entity failed', { jobId, entityKey: task.entityKey, error: msg });
          set((state) => {
            const j = state.sketchGenerateJob;
            if (!j || j.id !== jobId) return;
            j.tasks[i].status = 'error';
            j.tasks[i].error = msg;
            j.tasks[i].completedAt = new Date().toISOString();
          });
        }
        // NO break — partial success: continue to the next entity.
      } finally {
        if (lockTarget) await resourceLock.release(lockTarget); // n+ release ASAP so others can edit
      }
    }

    // Finalize (only if this job is still the active one).
    set((state) => {
      const j = state.sketchGenerateJob;
      if (!j || j.id !== jobId) return;
      j.status = j.cancelRequested ? 'cancelled' : 'completed';
      j.currentIndex = -1;
      j.completedAt = new Date().toISOString();
    });

    if (collab) {
      // ONE summary audit row per job (client-direct) — only when something was generated.
      if (generatedKeys.length > 0) {
        void insertGenerateSummaryLog({
          bookId: get().meta.bookId ?? '',
          actorId: resourceLock.myUserId ?? '',
          actionType: ACTION_TYPE_UPLOAD,
          targetType: TARGET_TYPE_ENTITY,
          targetRef: { kind, entities: generatedKeys, count: generatedKeys.length },
          // content-sync scope 'set': a peer refetches + whole-replaces this entity collection
          // (sketch.<kind>) at the active version. `kind` is the same key that indexes
          // get().sketch[kind] → symmetric with the peer's get_snapshot_node('sketch',[kind]).
          metadata: {
            sync: { scope: 'set', version: get().meta.id ?? '', targets: [{ column: 'sketch', path: [kind] }] },
          },
        });
      }
    } else {
      // legacy: final flush to cover any intermediate autosave skipped by the isSaving self-guard.
      void get().autoSaveSnapshot();
    }
  }

  return {
    sketchGenerateJob: null,

    startSketchGenerateJob: ({ kind, entityKeys, artStyleId }) => {
      if (get().sketchGenerateJob?.status === 'running') {
        log.warn('startSketchGenerateJob', 'blocked — a job is already running', { kind });
        return;
      }

      // Build tasks: keep order, skip missing entities and empty-variant entities (defensive net —
      // >12 filtering happens client-side in the content-area before this call, Validation S1).
      const entities = get().sketch[kind];
      const tasks: SketchGenerateTask[] = [];
      for (const key of entityKeys) {
        const entity = entities.find((e) => e.key === key);
        if (!entity || entity.variants.length === 0) {
          log.warn('startSketchGenerateJob', 'skip entity (missing or no variants)', { kind, key });
          continue;
        }
        tasks.push({
          entityKey: key,
          entityName: titleCase(key),
          variantCount: entity.variants.length,
          status: 'pending',
        });
      }

      if (tasks.length === 0) {
        log.warn('startSketchGenerateJob', 'nothing to generate — no eligible entities', { kind });
        return; // caller (content-area) already toasted "nothing to generate"
      }

      const jobId = crypto.randomUUID();
      log.info('startSketchGenerateJob', 'start', { jobId, kind, taskCount: tasks.length });
      set((state) => {
        state.sketchGenerateJob = {
          id: jobId,
          kind,
          status: 'running',
          tasks,
          currentIndex: 0,
          cancelRequested: false,
          skipped: 0,
          skippedNames: [],
          createdAt: new Date().toISOString(),
        };
      });

      void runJob(jobId, kind, artStyleId);
    },

    cancelSketchGenerateJob: () =>
      set((state) => {
        const job = state.sketchGenerateJob;
        if (job?.status === 'running') {
          log.info('cancelSketchGenerateJob', 'cancel requested', { jobId: job.id });
          job.cancelRequested = true;
        }
      }),

    dismissSketchGenerateJob: () =>
      set((state) => {
        if (state.sketchGenerateJob && state.sketchGenerateJob.status !== 'running') {
          state.sketchGenerateJob = null;
        }
      }),
  };
};
