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
import type { SketchSpread, SketchPageType } from '@/types/sketch';
// resource-lock-store is loaded by snapshot-store/index (line 6) BEFORE the slices, so this static
// import resolves cleanly in the app. The isolated slice unit tests import this module directly
// (bypassing index) and therefore mock '@/stores/resource-lock-store' to avoid the module cycle
// (slice → resource-lock-store → auth-store → snapshot-store/index → slice).
import { useResourceLockStore, type LockTarget, type ResourceLockState } from '@/stores/resource-lock-store';
import {
  insertGenerateSummaryLog,
  ACTION_TYPE_UPLOAD,
  TARGET_TYPE_SPREAD,
} from '@/apis/activity-log-client';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SketchSpreadGenerateJobSlice');

/** LockTarget for one spread PER-PAGE image (resource_type 1, language-agnostic). The
 *  resource_id is the SketchSpreadImage.id — matches the canvas's image lock (phase 04). */
function imageLockTarget(imageId: string): LockTarget {
  return { step: 1, resource_type: 1, resource_id: imageId, locale: null };
}

/** 1-based doc-order "spread #N" of a spread (audit `spread_number`), or 0 if not found. */
function spreadNumber(spreadId: string, spreads: SketchSpread[]): number {
  const idx = spreads.findIndex((s) => s.id === spreadId);
  return idx < 0 ? 0 : idx + 1;
}

/**
 * Pages to generate for a spread, IN ORDER: 'full' alone, else 'left' BEFORE 'right'. Left-before-
 * right is mandatory — the backend only builds CURRENT_SPREAD_LEFT_PAGE (gutter continuity) for
 * 'right' once the left page is drawn + persisted. Sorted explicitly, not from pages[] order.
 */
function orderedPageTypes(spread: SketchSpread): SketchPageType[] {
  const present = new Set(spread.pages.map((p) => p.type));
  if (present.has('full')) return ['full'];
  return (['left', 'right'] as SketchPageType[]).filter((t) => present.has(t));
}

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

  // ── collab per-spread driver ────────────────────────────────────────────────────────────────
  // Holds a lock per PER-PAGE image, generates each page, and flushes DATA-ONLY through the gateway
  // save (log:false) under the lock — replacing autoSaveSnapshot/flushSnapshot (a no-op under
  // collabPersist). Returns: 'replaced' → caller returns from runJob (job reset); 'cancelled' →
  // caller breaks the loop; 'ok' → continue to the next spread. Releases ALL held image locks at
  // spread end (finally). Skip semantics: a page whose EXISTING image is 409-blocked is skipped;
  // a spread with ALL pages blocked counts as skipped (job.skipped); a partially-blocked spread
  // (≥1 page generated) counts as generated (partial spread — see risk note).
  async function processSpreadCollab(
    resourceLock: ResourceLockState,
    jobId: string,
    i: number,
    task: SketchSpreadGenerateTask,
    spread: SketchSpread,
    artStyleId: string,
    snapshotId: string,
    generatedSpreadNumbers: number[],
  ): Promise<'ok' | 'replaced' | 'cancelled'> {
    const pageTypes = orderedPageTypes(spread);
    const heldTargets: LockTarget[] = []; // image locks held for THIS spread (released at end)
    const skippedPages = new Set<SketchPageType>();
    const heldFor = (imageId: string): boolean =>
      heldTargets.some((t) => t.resource_id === imageId);
    let lastUrl = '';
    let cancelledMidSpread = false;

    try {
      // Phase A — acquire locks for pages whose image already EXISTS, so both left+right are held
      // for the spread's duration. A page with no image yet (first generate) has no id to lock →
      // it is acquired right after creation in Phase B.
      for (const pageType of pageTypes) {
        const existing = spread.images.find((im) => im.type === pageType);
        if (!existing) continue;
        const target = imageLockTarget(existing.id);
        const acq = await resourceLock.acquire(target);
        if (get().sketchSpreadGenerateJob?.id !== jobId) {
          if (acq.ok) heldTargets.push(target); // finally releases
          return 'replaced';
        }
        if (acq.ok) {
          heldTargets.push(target);
        } else {
          log.info('processSpreadCollab', 'page image locked by another — skip page', {
            jobId,
            spreadId: task.spreadId,
            page: pageType,
            holder: acq.holder,
          });
          skippedPages.add(pageType);
        }
      }

      // Phase B — generate each non-skipped page IN ORDER (left before right), persist via gateway.
      for (const pageType of pageTypes) {
        if (skippedPages.has(pageType)) continue;
        const cur = get().sketchSpreadGenerateJob;
        if (!cur || cur.id !== jobId) return 'replaced';
        if (cur.cancelRequested) {
          cancelledMidSpread = true;
          break;
        }

        const result = await callGenerateSketchSpread({
          snapshotId,
          sketchSpreadId: task.spreadId,
          artStyleId,
          page: pageType,
        });
        if (get().sketchSpreadGenerateJob?.id !== jobId) return 'replaced';
        if (!result.success || !result.data) throw new Error(classifyError(result));

        lastUrl = result.data.imageUrl;
        log.info('processSpreadCollab', 'spread page done', {
          jobId,
          spreadId: task.spreadId,
          page: pageType,
        });
        get().addSketchSpreadImageVersion(task.spreadId, pageType, lastUrl);

        // Resolve the (now-existing) per-page image node + id; acquire its lock if it was deferred
        // (brand-new page), then save DATA-ONLY (log:false) so 'left' lands in the DB before 'right'
        // generates (backend consistency read) — replacing the flush-after-left.
        const img = get()
          .sketch.spreads.find((s) => s.id === task.spreadId)
          ?.images.find((im) => im.type === pageType);
        if (!img) {
          log.warn('processSpreadCollab', 'page image missing after version add — skip save', {
            jobId,
            spreadId: task.spreadId,
            page: pageType,
          });
          continue;
        }
        const target = imageLockTarget(img.id);
        if (!heldFor(img.id)) {
          const acq = await resourceLock.acquire(target);
          if (get().sketchSpreadGenerateJob?.id !== jobId) {
            if (acq.ok) heldTargets.push(target);
            return 'replaced';
          }
          if (acq.ok) {
            heldTargets.push(target);
          } else {
            log.warn('processSpreadCollab', 'could not lock new page image — keep local, skip save', {
              jobId,
              spreadId: task.spreadId,
              page: pageType,
              holder: acq.holder,
            });
            continue; // data is local; without a lock the gateway save would 409
          }
        }
        const saveRes = await resourceLock.save(target, {
          action_type: ACTION_TYPE_UPLOAD,
          patch: img,
          target_ref: { spread_number: spreadNumber(task.spreadId, get().sketch.spreads), page: pageType },
          log: false,
        });
        if (get().sketchSpreadGenerateJob?.id !== jobId) return 'replaced';
        if (!saveRes.ok) {
          log.warn('processSpreadCollab', 'page save under lock failed — may not persist', {
            jobId,
            spreadId: task.spreadId,
            page: pageType,
            lost: saveRes.lost,
          });
        }
      }

      const num = spreadNumber(task.spreadId, get().sketch.spreads);

      // Cancel arrived mid-spread → mark this task terminal (tasks[] has no 'cancelled' status), then
      // signal the outer loop to stop. Any page already generated was persisted (per-page save).
      if (cancelledMidSpread) {
        if (lastUrl) generatedSpreadNumbers.push(num);
        set((state) => {
          const j = state.sketchSpreadGenerateJob;
          if (!j || j.id !== jobId) return;
          if (lastUrl) {
            j.tasks[i].status = 'completed';
            j.tasks[i].imageUrl = lastUrl;
          } else {
            j.tasks[i].status = 'error';
            j.tasks[i].error = 'Cancelled before this spread finished';
          }
          j.tasks[i].completedAt = new Date().toISOString();
        });
        return 'cancelled';
      }

      if (lastUrl) {
        // ≥1 page generated → success (partial if a page was skip-blocked — partial-spread risk).
        generatedSpreadNumbers.push(num);
        set((state) => {
          const j = state.sketchSpreadGenerateJob;
          if (!j || j.id !== jobId) return;
          j.tasks[i].status = 'completed';
          j.tasks[i].imageUrl = lastUrl;
          j.tasks[i].completedAt = new Date().toISOString();
        });
      } else if (skippedPages.size > 0 && skippedPages.size === pageTypes.length) {
        // ALL pages blocked by other editors → the whole spread is SKIPPED (not a failure).
        set((state) => {
          const j = state.sketchSpreadGenerateJob;
          if (!j || j.id !== jobId) return;
          j.skipped += 1;
          j.skippedNames.push(`spread #${num}`);
          j.tasks[i].status = 'error';
          j.tasks[i].skipped = true;
          j.tasks[i].error = 'Skipped — being edited by another editor';
          j.tasks[i].completedAt = new Date().toISOString();
        });
      } else {
        // No url and not all-skipped (e.g. spread has no pages) → defensive error.
        set((state) => {
          const j = state.sketchSpreadGenerateJob;
          if (!j || j.id !== jobId) return;
          j.tasks[i].status = 'error';
          j.tasks[i].error = 'No page generated';
          j.tasks[i].completedAt = new Date().toISOString();
        });
      }
      return 'ok';
    } catch (err) {
      if (get().sketchSpreadGenerateJob?.id !== jobId) return 'replaced';
      const msg = err instanceof Error ? err.message : 'Spread image generation failed';
      log.error('processSpreadCollab', 'spread failed', { jobId, spreadId: task.spreadId, error: msg });
      set((state) => {
        const j = state.sketchSpreadGenerateJob;
        if (!j || j.id !== jobId) return;
        j.tasks[i].status = 'error';
        j.tasks[i].error = msg;
        j.tasks[i].completedAt = new Date().toISOString();
      });
      return 'ok'; // NO abort — continue to the next spread
    } finally {
      for (const t of heldTargets) await resourceLock.release(t); // release BOTH image locks at spread end
    }
  }

  // Sequential driver. Fire-and-forget from startSketchSpreadGenerateJob (never awaited).
  async function runJob(jobId: string, artStyleId: string): Promise<void> {
    const initial = get().sketchSpreadGenerateJob;
    if (!initial || initial.id !== jobId) return;

    // collabPersist = inside a sketch collab space (always true in practice). When true every write
    // routes through the resource-lock gateway (per-page save, log:false) + ONE summary audit row.
    // When false (legacy solo path) keep the autoSaveSnapshot/flushSnapshot flow untouched (KISS).
    // actorId for the summary row = resourceLock.myUserId (auth user id resolved at connect).
    const resourceLock = useResourceLockStore.getState();
    const collab = resourceLock.collabPersist;

    // Initial flush (LEGACY only): under collab, autoSaveSnapshot is suppressed so flushSnapshot is a
    // no-op — pending edits are already gateway-persisted per-resource, and a collab book already has
    // meta.id. In legacy solo mode we still flush to land edits + mint the snapshot row.
    if (!collab) {
      await get().flushSnapshot();
      if (get().sketchSpreadGenerateJob?.id !== jobId) return; // reset during flush
    }

    const snapshotId = get().meta.id;
    if (!snapshotId) {
      log.warn('runJob', 'no snapshot id — cannot generate', { jobId, collab });
      finalize(jobId);
      toast.error('Save the book first, then generate spread images.');
      return;
    }

    const generatedSpreadNumbers: number[] = []; // spreads that produced ≥1 page (summary ref)
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

      if (collab) {
        const outcome = await processSpreadCollab(
          resourceLock,
          jobId,
          i,
          task,
          spread,
          artStyleId,
          snapshotId,
          generatedSpreadNumbers,
        );
        if (outcome === 'replaced') return; // job reset — abandon (locks already released)
        if (outcome === 'cancelled') break; // stop the whole job cleanly
        continue; // 'ok' → next spread
      }

      // ── LEGACY solo path (collabPersist false) — unchanged flush-based flow ──
      try {
        // PER-PAGE loop: 'full' → 1 call; 2-page → 'left' then 'right'. One API call = one page.
        const pageTypes = orderedPageTypes(spread);
        let lastUrl = '';
        let cancelledMidSpread = false;

        for (const pageType of pageTypes) {
          // Re-check cancel / job-replacement BEFORE each page call → clean stop between left→right.
          const cur = get().sketchSpreadGenerateJob;
          if (!cur || cur.id !== jobId) return;
          if (cur.cancelRequested) {
            cancelledMidSpread = true;
            break;
          }

          const result = await callGenerateSketchSpread({
            snapshotId,
            sketchSpreadId: task.spreadId,
            artStyleId,
            page: pageType,
          });

          if (get().sketchSpreadGenerateJob?.id !== jobId) return; // race: job replaced during await
          if (!result.success || !result.data) throw new Error(classifyError(result));

          lastUrl = result.data.imageUrl;
          log.info('runJob', 'spread page done', { jobId, spreadId: task.spreadId, page: pageType });

          // Prepend the version (sync.isDirty) into the page's slot.
          get().addSketchSpreadImageVersion(task.spreadId, pageType, lastUrl);

          // Flush AFTER 'left' (before 'right') so the backend's CURRENT_SPREAD_LEFT_PAGE read for
          // 'right' sees the left page already persisted in the DB (gutter continuity — R1).
          if (pageType === 'left' && pageTypes.includes('right')) {
            await get().flushSnapshot();
            if (get().sketchSpreadGenerateJob?.id !== jobId) return; // race: reset during flush
          }
        }

        // Cancel arrived mid-spread → stop the whole job cleanly; finalize() marks it 'cancelled'.
        // Mark THIS task terminal too (the tasks[] status has no 'cancelled' member) — otherwise it
        // stays 'running' and the per-page spinner overlay never clears until the next job replaces
        // the job object. Any page already generated was persisted (flush-after-left): if a page
        // landed, the task is 'completed' (its image exists); if cancel hit before the first page
        // produced anything, it's 'error'.
        if (cancelledMidSpread) {
          set((state) => {
            const j = state.sketchSpreadGenerateJob;
            if (!j || j.id !== jobId) return;
            if (lastUrl) {
              j.tasks[i].status = 'completed';
              j.tasks[i].imageUrl = lastUrl;
            } else {
              j.tasks[i].status = 'error';
              j.tasks[i].error = 'Cancelled before this spread finished';
            }
            j.tasks[i].completedAt = new Date().toISOString();
          });
          break;
        }

        set((state) => {
          const j = state.sketchSpreadGenerateJob;
          if (!j || j.id !== jobId) return;
          j.tasks[i].status = 'completed';
          j.tasks[i].imageUrl = lastUrl;
          j.tasks[i].completedAt = new Date().toISOString();
        });

        // AWAIT the flush after the whole spread so the NEXT spread's PREVIOUS_SPREADS_SHEET read
        // sees this spread's pages already persisted in the DB.
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

    // Summary audit (collab only) — ONE client-direct row per job, when ≥1 spread generated.
    // Drop 0 sentinels (spreadNumber() returns 0 for a spread concurrently deleted by
    // another editor) so the audit feed never shows a bogus "spread #0".
    const auditSpreadNumbers = generatedSpreadNumbers.filter((n) => n > 0);
    if (collab && auditSpreadNumbers.length > 0) {
      void insertGenerateSummaryLog({
        bookId: get().meta.bookId ?? '',
        actorId: resourceLock.myUserId ?? '',
        actionType: ACTION_TYPE_UPLOAD,
        targetType: TARGET_TYPE_SPREAD,
        targetRef: { spread_numbers: auditSpreadNumbers, count: auditSpreadNumbers.length },
      });
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
          skipped: 0,
          skippedNames: [],
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
