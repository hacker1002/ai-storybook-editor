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
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SketchGenerateJobSlice');

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

        if (get().sketchGenerateJob?.id !== jobId) return; // race: job replaced during the await
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

        // Persist media_url onto the entity (sketch-slice sets sync.isDirty) + flush per-entity.
        get().setSketchEntityMediaUrl(kind, task.entityKey, url);
        void get().autoSaveSnapshot(); // fire-and-forget; self-guards on isSaving/!isDirty
      } catch (err) {
        if (get().sketchGenerateJob?.id !== jobId) return;
        const msg = err instanceof Error ? err.message : 'Sketch generation failed';
        log.error('runJob', 'entity failed', { jobId, entityKey: task.entityKey, error: msg });
        set((state) => {
          const j = state.sketchGenerateJob;
          if (!j || j.id !== jobId) return;
          j.tasks[i].status = 'error';
          j.tasks[i].error = msg;
          j.tasks[i].completedAt = new Date().toISOString();
        });
        // NO break — partial success: continue to the next entity.
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
    // Final flush to cover any intermediate autosave skipped by the isSaving self-guard.
    void get().autoSaveSnapshot();
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
