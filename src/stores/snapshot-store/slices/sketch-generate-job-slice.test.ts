import { describe, it, expect, beforeEach, vi } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createSketchSlice } from './sketch-slice';
import { createSketchGenerateJobSlice } from './sketch-generate-job-slice';
import type { SketchEntity } from '@/types/sketch';
import { callGenerateSketchSheet } from '@/apis/sketch-sheet-api';

// Mock only the api-client seam — keeps supabase/image-api-client out of the unit test.
vi.mock('@/apis/sketch-sheet-api', () => ({ callGenerateSketchSheet: vi.fn() }));
const mockedCall = vi.mocked(callGenerateSketchSheet);

// Isolated harness: sketch slice (state + setSketchEntityMediaUrl) + the job slice, plus the
// only cross-slice deps the job slice touches (sync.isDirty via setter, autoSaveSnapshot stub).
/* eslint-disable @typescript-eslint/no-explicit-any */
function createTestStore() {
  const autoSaveSnapshot = vi.fn(async () => {});
  const store = create<any>()(
    immer((...a: any[]) => ({
      ...(createSketchSlice as any)(...a),
      ...(createSketchGenerateJobSlice as any)(...a),
      sync: { isDirty: false, isSaving: false },
      autoSaveSnapshot,
    })),
  );
  return { store, autoSaveSnapshot };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const entity = (key: string, variantKeys: string[] = ['base']): SketchEntity => ({
  key,
  media_url: null,
  variants: variantKeys.map((k) => ({ key: k, visual_description: `${key}-${k}` })),
});

const ok = (url: string) => ({
  success: true as const,
  data: { imageUrl: url, storagePath: `path/${url}`, cellOrder: [] },
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// Drain microtasks by yielding a macrotask — lets runJob's post-await continuation run
// deterministically (no fake timers → no flakiness on the sequential ordering).
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('SketchGenerateJobSlice', () => {
  let store: ReturnType<typeof createTestStore>['store'];
  let autoSaveSnapshot: ReturnType<typeof createTestStore>['autoSaveSnapshot'];

  beforeEach(() => {
    mockedCall.mockReset();
    ({ store, autoSaveSnapshot } = createTestStore());
  });

  const start = (keys: string[]) =>
    store.getState().startSketchGenerateJob({ kind: 'characters', entityKeys: keys, artStyleId: 'style-1' });

  it('runs entities sequentially: call #2 only fires after #1 resolves', async () => {
    store.getState().setSketchEntities('characters', [entity('kid'), entity('mom')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    const d2 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValueOnce(d1.promise as never).mockReturnValueOnce(d2.promise as never);

    start(['kid', 'mom']);
    await tick();

    // Only the first entity is in flight.
    expect(mockedCall).toHaveBeenCalledTimes(1);
    expect(mockedCall.mock.calls[0][1].entityKey).toBe('kid');
    expect(store.getState().sketchGenerateJob.tasks[0].status).toBe('running');
    expect(store.getState().sketchGenerateJob.tasks[1].status).toBe('pending');

    d1.resolve(ok('kid.png'));
    await tick();

    // First done → media_url written + autosave fired + second call now dispatched.
    expect(store.getState().sketch.characters[0].media_url).toBe('kid.png');
    expect(autoSaveSnapshot).toHaveBeenCalled();
    expect(mockedCall).toHaveBeenCalledTimes(2);
    expect(mockedCall.mock.calls[1][1].entityKey).toBe('mom');

    d2.resolve(ok('mom.png'));
    await tick();

    expect(store.getState().sketch.characters[1].media_url).toBe('mom.png');
    const job = store.getState().sketchGenerateJob;
    expect(job.status).toBe('completed');
    expect(job.currentIndex).toBe(-1);
    expect(job.tasks.every((t: { status: string }) => t.status === 'completed')).toBe(true);
  });

  it('partial failure: entity #1 fails, job continues and completes (mixed statuses)', async () => {
    store.getState().setSketchEntities('characters', [entity('kid'), entity('mom')]);
    mockedCall
      .mockResolvedValueOnce({ success: false, error: 'boom', errorCode: 'LLM_ERROR' } as never)
      .mockResolvedValueOnce(ok('mom.png') as never);

    start(['kid', 'mom']);
    await tick();
    await tick();

    const job = store.getState().sketchGenerateJob;
    expect(job.status).toBe('completed'); // NOT aborted by the failure
    expect(job.tasks[0].status).toBe('error');
    expect(job.tasks[0].error).toContain('image model'); // LLM_ERROR friendly copy
    expect(job.tasks[1].status).toBe('completed');
    expect(store.getState().sketch.characters[0].media_url).toBeNull();
    expect(store.getState().sketch.characters[1].media_url).toBe('mom.png');
  });

  it('skips empty-variant entities at build time (no task created)', async () => {
    store.getState().setSketchEntities('characters', [entity('kid'), entity('empty', [])]);
    mockedCall.mockResolvedValue(ok('kid.png') as never);

    start(['kid', 'empty']);
    await tick();
    await tick();

    const job = store.getState().sketchGenerateJob;
    expect(job.tasks.map((t: { entityKey: string }) => t.entityKey)).toEqual(['kid']);
    expect(mockedCall).toHaveBeenCalledTimes(1);
  });

  it('skips an entity deleted mid-job (SKIPPED_DELETED)', async () => {
    store.getState().setSketchEntities('characters', [entity('kid'), entity('mom')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValueOnce(d1.promise as never).mockResolvedValueOnce(ok('mom.png') as never);

    start(['kid', 'mom']);
    await tick();

    // Delete mom before its turn.
    store.getState().removeSketchEntity('characters', 'mom');
    d1.resolve(ok('kid.png'));
    await tick();
    await tick();

    const job = store.getState().sketchGenerateJob;
    expect(job.tasks[0].status).toBe('completed');
    expect(job.tasks[1].status).toBe('error');
    expect(job.tasks[1].error).toMatch(/deleted/i);
    // mom was never called (only the kid call happened).
    expect(mockedCall).toHaveBeenCalledTimes(1);
    expect(job.status).toBe('completed');
  });

  it('cancel stops before the next entity (in-flight call still completes)', async () => {
    store.getState().setSketchEntities('characters', [entity('kid'), entity('mom')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValueOnce(d1.promise as never);

    start(['kid', 'mom']);
    await tick();
    expect(mockedCall).toHaveBeenCalledTimes(1);

    store.getState().cancelSketchGenerateJob();
    d1.resolve(ok('kid.png'));
    await tick();
    await tick();

    const job = store.getState().sketchGenerateJob;
    expect(job.status).toBe('cancelled');
    expect(job.tasks[0].status).toBe('completed'); // in-flight kid finished
    expect(mockedCall).toHaveBeenCalledTimes(1); // mom never dispatched
  });

  it('enforces one job at a time (second start is a no-op)', async () => {
    store.getState().setSketchEntities('characters', [entity('kid'), entity('mom')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValue(d1.promise as never);

    start(['kid']);
    await tick();
    const jobId = store.getState().sketchGenerateJob.id;

    start(['mom']); // blocked — a job is running
    expect(store.getState().sketchGenerateJob.id).toBe(jobId);
    expect(mockedCall).toHaveBeenCalledTimes(1);

    d1.resolve(ok('kid.png'));
    await tick();
  });

  it('race: job cleared mid-await → no media_url write after reset', async () => {
    store.getState().setSketchEntities('characters', [entity('kid')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValueOnce(d1.promise as never);

    start(['kid']);
    await tick();

    // Simulate resetSnapshot clearing the job while the call is in flight.
    store.setState((s: { sketchGenerateJob: unknown }) => {
      s.sketchGenerateJob = null;
    });
    d1.resolve(ok('kid.png'));
    await tick();

    expect(store.getState().sketch.characters[0].media_url).toBeNull();
    expect(store.getState().sketchGenerateJob).toBeNull();
  });
});
