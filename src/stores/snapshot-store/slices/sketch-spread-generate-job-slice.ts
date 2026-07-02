// sketch-spread-generate-job-slice.ts — orchestrates SEQUENTIAL sketch spread-image generation.
// One job = N spreads, one API call per spread, run one-at-a-time in DOC-ORDER (position in
// sketch.spreads[]). After each spread resolves: prepend a versioned backdrop
// (addSketchSpreadImageVersion → sync.isDirty) then AWAIT flushSnapshot() so the write lands in
// the DB before the next spread — the backend reads prior spreads for a consistent look, and the
// UI fills in gradually / survives a reload. Partial failures never abort the job.
//
// Differs from sketch-generate-job-slice (entity sheets): 1 task = 1 spread (no `kind`), no
// snapshotId param (resolved from meta.id AFTER an initial flush — a brand-new unsaved book has
// no snapshot row until then), and the per-spread flush is AWAITED (not fire-and-forget).
//
// Async rule (mirrors image-task-slice): runJob is a PLAIN async function (NOT inside an immer
// producer). Every mutation between awaits goes through a synchronous set((state)=>…) producer.
// After each await we re-read the job and bail if it was replaced/reset (race guard).

import type { StateCreator } from 'zustand';
import type {
  SnapshotStore,
  SketchSpreadGenerateJobSlice,
  SketchSpreadGenerateTask,
} from '../types';
import { callGenerateSketchSpread } from '@/apis/sketch-spread-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SketchSpreadGenerateJobSlice');

// Backend error codes → user-facing English (mirrors SKETCH_ERROR_MESSAGES in the entity job).
const SKETCH_SPREAD_ERROR_MESSAGES: Record<string, string> = {
  SPREAD_NO_ART_DIRECTION: 'This spread has no art direction yet — add it before generating.',
  ART_STYLE_NOT_FOUND: 'Selected art style not found — please pick one again in settings.',
  ART_STYLE_NO_REFERENCES: 'This art style has no reference images — add some in Style settings.',
  VALIDATION_ERROR: 'Invalid spread request — check the spread setup.',
  LLM_ERROR: 'The image model failed to generate this spread — please try again.',
  NO_IMAGE_IN_RESPONSE: 'The image model returned no image — please try again.',
};

const SKIPPED_DELETED_MESSAGE = 'Skipped — spread was deleted';

/** Maps an ImageApiFailure (or a non-success result) to a friendly message. */
function classifyError(result: { error?: string }): string {
  const code = (result as ImageApiFailure).errorCode;
  return (
    (code && SKETCH_SPREAD_ERROR_MESSAGES[code]) || result.error || 'Spread image generation failed'
  );
}

export const createSketchSpreadGenerateJobSlice: StateCreator<
  SnapshotStore,
  [['zustand/immer', never]],
  [],
  SketchSpreadGenerateJobSlice
> = (set, get) => {
  /** status = cancelled if a cancel was requested, else completed. Only if still the active job. */
  function finalize(jobId: string): void {
    set((state) => {
      const j = state.sketchSpreadGenerateJob;
      if (!j || j.id !== jobId) return;
      j.status = j.cancelRequested ? 'cancelled' : 'completed';
      j.currentIndex = -1;
      j.completedAt = new Date().toISOString();
    });
  }

  // Sequential driver. Fire-and-forget from startSketchSpreadGenerateJob (never awaited).
  async function runJob(jobId: string, artStyleId: string): Promise<void> {
    const initial = get().sketchSpreadGenerateJob;
    if (!initial || initial.id !== jobId) return;

    // Initial flush: land any pending edits (art_direction, entity sheets) AND — for a brand-new
    // unsaved book — create the snapshot row so meta.id resolves. Backend reads this snapshot.
    await get().flushSnapshot();
    if (get().sketchSpreadGenerateJob?.id !== jobId) return; // reset during flush

    const snapshotId = get().meta.id;
    if (!snapshotId) {
      log.warn('runJob', 'no snapshot id after flush — cannot generate', { jobId });
      finalize(jobId);
      toast.error('Save the book first, then generate spread images.');
      return;
    }

    const taskCount = initial.tasks.length;
    for (let i = 0; i < taskCount; i++) {
      const job = get().sketchSpreadGenerateJob;
      if (!job || job.id !== jobId) return; // reset / replaced by a new job
      if (job.cancelRequested) break; // cancel = stop before the next spread

      const task = job.tasks[i];
      const spread = get().sketch.spreads.find((s) => s.id === task.spreadId);

      if (!spread) {
        log.warn('runJob', 'spread deleted mid-job — skip', { jobId, spreadId: task.spreadId });
        set((state) => {
          const j = state.sketchSpreadGenerateJob;
          if (!j || j.id !== jobId) return;
          j.tasks[i].status = 'error';
          j.tasks[i].error = SKIPPED_DELETED_MESSAGE;
          j.tasks[i].completedAt = new Date().toISOString();
        });
        continue;
      }

      set((state) => {
        const j = state.sketchSpreadGenerateJob;
        if (!j || j.id !== jobId) return;
        j.currentIndex = i;
        j.tasks[i].status = 'running';
        j.tasks[i].startedAt = new Date().toISOString();
      });

      try {
        const result = await callGenerateSketchSpread({
          snapshotId,
          sketchSpreadId: task.spreadId,
          artStyleId,
        });

        if (get().sketchSpreadGenerateJob?.id !== jobId) return; // race: job replaced during await
        if (!result.success || !result.data) throw new Error(classifyError(result));

        const url = result.data.imageUrl;
        log.info('runJob', 'spread image done', { jobId, spreadId: task.spreadId });

        set((state) => {
          const j = state.sketchSpreadGenerateJob;
          if (!j || j.id !== jobId) return;
          j.tasks[i].status = 'completed';
          j.tasks[i].imageUrl = url;
          j.tasks[i].completedAt = new Date().toISOString();
        });

        // Prepend the version (sync.isDirty) then AWAIT the flush so the next spread's
        // consistency read sees this image already persisted in the DB.
        get().addSketchSpreadImageVersion(task.spreadId, url);
        await get().flushSnapshot();
        if (get().sketchSpreadGenerateJob?.id !== jobId) return; // race: reset during flush
      } catch (err) {
        if (get().sketchSpreadGenerateJob?.id !== jobId) return;
        const msg = err instanceof Error ? err.message : 'Spread image generation failed';
        log.error('runJob', 'spread failed', { jobId, spreadId: task.spreadId, error: msg });
        set((state) => {
          const j = state.sketchSpreadGenerateJob;
          if (!j || j.id !== jobId) return;
          j.tasks[i].status = 'error';
          j.tasks[i].error = msg;
          j.tasks[i].completedAt = new Date().toISOString();
        });
        // NO break — partial success: continue to the next spread.
      }
    }

    finalize(jobId);
  }

  return {
    sketchSpreadGenerateJob: null,

    startSketchSpreadGenerateJob: ({ spreadIds, artStyleId }) => {
      if (get().sketchSpreadGenerateJob?.status === 'running') {
        log.warn('startSketchSpreadGenerateJob', 'blocked — a job is already running');
        return;
      }

      // Build tasks in DOC-ORDER: keep only ids that exist in sketch.spreads[], dedup, then sort by
      // position so spread[i] runs after spread[i-1] (backend can read prior spreads from the DB).
      const spreads = get().sketch.spreads;
      const indexById = new Map(spreads.map((s, i) => [s.id, i] as const));
      const orderedIds = [...new Set(spreadIds)]
        .filter((id) => indexById.has(id))
        .sort((a, b) => indexById.get(a)! - indexById.get(b)!);

      const tasks: SketchSpreadGenerateTask[] = orderedIds.map((spreadId, i) => ({
        spreadId,
        ordinal: i + 1,
        status: 'pending',
      }));

      if (tasks.length === 0) {
        log.warn('startSketchSpreadGenerateJob', 'nothing to generate — no eligible spreads');
        return; // caller (content-area) already toasted "nothing to generate"
      }

      const jobId = crypto.randomUUID();
      log.info('startSketchSpreadGenerateJob', 'start', { jobId, taskCount: tasks.length });
      set((state) => {
        state.sketchSpreadGenerateJob = {
          id: jobId,
          status: 'running',
          tasks,
          currentIndex: 0,
          cancelRequested: false,
          createdAt: new Date().toISOString(),
        };
      });

      void runJob(jobId, artStyleId);
    },

    cancelSketchSpreadGenerateJob: () =>
      set((state) => {
        const job = state.sketchSpreadGenerateJob;
        if (job?.status === 'running') {
          log.info('cancelSketchSpreadGenerateJob', 'cancel requested', { jobId: job.id });
          job.cancelRequested = true;
        }
      }),

    dismissSketchSpreadGenerateJob: () =>
      set((state) => {
        if (state.sketchSpreadGenerateJob && state.sketchSpreadGenerateJob.status !== 'running') {
          state.sketchSpreadGenerateJob = null;
        }
      }),
  };
};
