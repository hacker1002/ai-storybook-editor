import { describe, it, expect, beforeEach, vi } from 'vitest';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createSketchSlice } from './sketch-slice';
import { createSketchSpreadGenerateJobSlice } from './sketch-spread-generate-job-slice';
import type { SketchSpread } from '@/types/sketch';
import { callGenerateSketchSpread } from '@/apis/sketch-spread-api';

// Mock the sonner toast (the snapshotId-null path toasts) + the api-client seam.
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('@/apis/sketch-spread-api', () => ({ callGenerateSketchSpread: vi.fn() }));
const mockedCall = vi.mocked(callGenerateSketchSpread);

// Isolated harness: sketch slice (state + addSketchSpreadImageVersion) + the spread-job slice, plus
// the only cross-slice deps runJob touches — sync (isDirty via producer), meta.id (snapshotId
// resolved after the initial flush) and flushSnapshot (awaited; stubbed to a no-op).
/* eslint-disable @typescript-eslint/no-explicit-any */
function createTestStore(metaId: string | null = 'snap-1') {
  const flushSnapshot = vi.fn(async () => {});
  const store = create<any>()(
    immer((...a: any[]) => ({
      ...(createSketchSlice as any)(...a),
      ...(createSketchSpreadGenerateJobSlice as any)(...a),
      sync: { isDirty: false, isSaving: false },
      meta: { id: metaId },
      flushSnapshot,
    })),
  );
  return { store, flushSnapshot };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const spread = (id: string): SketchSpread => ({ id, images: [], pages: [], textboxes: [] });

const ok = (url: string) => ({
  success: true as const,
  data: { imageUrl: url, storagePath: `path/${url}`, pageLayout: 'full' as const },
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
// deterministically (no fake timers → no flakiness on the sequential ordering / initial flush).
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const effectiveUrl = (s: SketchSpread): string | null =>
  s.images[0]?.illustrations.find((i) => i.is_selected)?.media_url ??
  s.images[0]?.illustrations[0]?.media_url ??
  null;

describe('SketchSpreadGenerateJobSlice', () => {
  let store: ReturnType<typeof createTestStore>['store'];
  let flushSnapshot: ReturnType<typeof createTestStore>['flushSnapshot'];

  beforeEach(() => {
    mockedCall.mockReset();
    ({ store, flushSnapshot } = createTestStore());
  });

  const start = (spreadIds: string[]) =>
    store.getState().startSketchSpreadGenerateJob({ spreadIds, artStyleId: 'style-1' });

  it('runs spreads sequentially: call #2 only fires after #1 resolves + version written + flushed', async () => {
    store.getState().setSketchSpreads([spread('a'), spread('b')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    const d2 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValueOnce(d1.promise as never).mockReturnValueOnce(d2.promise as never);

    start(['a', 'b']);
    await tick(); // initial flush + first dispatch

    expect(mockedCall).toHaveBeenCalledTimes(1);
    expect(mockedCall.mock.calls[0][0].sketchSpreadId).toBe('a');
    expect(mockedCall.mock.calls[0][0].snapshotId).toBe('snap-1');
    expect(store.getState().sketchSpreadGenerateJob.tasks[0].status).toBe('running');
    expect(store.getState().sketchSpreadGenerateJob.tasks[1].status).toBe('pending');

    d1.resolve(ok('a.png'));
    await tick();

    // First done → version prepended + selected, awaited flush fired, second call dispatched.
    expect(effectiveUrl(store.getState().sketch.spreads[0])).toBe('a.png');
    expect(flushSnapshot).toHaveBeenCalled();
    expect(mockedCall).toHaveBeenCalledTimes(2);
    expect(mockedCall.mock.calls[1][0].sketchSpreadId).toBe('b');

    d2.resolve(ok('b.png'));
    await tick();

    expect(effectiveUrl(store.getState().sketch.spreads[1])).toBe('b.png');
    const job = store.getState().sketchSpreadGenerateJob;
    expect(job.status).toBe('completed');
    expect(job.currentIndex).toBe(-1);
    expect(job.tasks.every((t: { status: string }) => t.status === 'completed')).toBe(true);
  });

  it('sorts targets into DOC-ORDER (position in sketch.spreads[])', async () => {
    store.getState().setSketchSpreads([spread('a'), spread('b'), spread('c')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValueOnce(d1.promise as never).mockResolvedValue(ok('x.png') as never);

    // Pass targets out of order + skip 'b' → tasks must be [a, c], 'a' runs first.
    start(['c', 'a']);
    await tick();

    const job = store.getState().sketchSpreadGenerateJob;
    expect(job.tasks.map((t: { spreadId: string }) => t.spreadId)).toEqual(['a', 'c']);
    expect(mockedCall.mock.calls[0][0].sketchSpreadId).toBe('a');

    d1.resolve(ok('a.png'));
    await tick();
    await tick();
  });

  it('partial failure: spread #1 fails, job continues + completes (mixed statuses)', async () => {
    store.getState().setSketchSpreads([spread('a'), spread('b')]);
    mockedCall
      .mockResolvedValueOnce({ success: false, error: 'boom', errorCode: 'LLM_ERROR' } as never)
      .mockResolvedValueOnce(ok('b.png') as never);

    start(['a', 'b']);
    await tick();
    await tick();
    await tick();

    const job = store.getState().sketchSpreadGenerateJob;
    expect(job.status).toBe('completed'); // NOT aborted by the failure
    expect(job.tasks[0].status).toBe('error');
    expect(job.tasks[0].error).toContain('image model'); // LLM_ERROR friendly copy
    expect(job.tasks[1].status).toBe('completed');
    expect(effectiveUrl(store.getState().sketch.spreads[0])).toBeNull();
    expect(effectiveUrl(store.getState().sketch.spreads[1])).toBe('b.png');
  });

  it('skips a spread deleted mid-job (SKIPPED_DELETED)', async () => {
    store.getState().setSketchSpreads([spread('a'), spread('b')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValueOnce(d1.promise as never).mockResolvedValueOnce(ok('b.png') as never);

    start(['a', 'b']);
    await tick();

    store.getState().deleteSketchSpread('b'); // delete before its turn
    d1.resolve(ok('a.png'));
    await tick();
    await tick();

    const job = store.getState().sketchSpreadGenerateJob;
    expect(job.tasks[0].status).toBe('completed');
    expect(job.tasks[1].status).toBe('error');
    expect(job.tasks[1].error).toMatch(/deleted/i);
    expect(mockedCall).toHaveBeenCalledTimes(1); // b never dispatched
    expect(job.status).toBe('completed');
  });

  it('cancel stops before the next spread (in-flight call still completes)', async () => {
    store.getState().setSketchSpreads([spread('a'), spread('b')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValueOnce(d1.promise as never);

    start(['a', 'b']);
    await tick();
    expect(mockedCall).toHaveBeenCalledTimes(1);

    store.getState().cancelSketchSpreadGenerateJob();
    d1.resolve(ok('a.png'));
    await tick();
    await tick();

    const job = store.getState().sketchSpreadGenerateJob;
    expect(job.status).toBe('cancelled');
    expect(job.tasks[0].status).toBe('completed'); // in-flight 'a' finished
    expect(mockedCall).toHaveBeenCalledTimes(1); // 'b' never dispatched
  });

  it('enforces one job at a time (second start is a no-op)', async () => {
    store.getState().setSketchSpreads([spread('a'), spread('b')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValue(d1.promise as never);

    start(['a']);
    await tick();
    const jobId = store.getState().sketchSpreadGenerateJob.id;

    start(['b']); // blocked — a job is running
    expect(store.getState().sketchSpreadGenerateJob.id).toBe(jobId);
    expect(mockedCall).toHaveBeenCalledTimes(1);

    d1.resolve(ok('a.png'));
    await tick();
  });

  it('race: job cleared mid-await → no version write after reset', async () => {
    store.getState().setSketchSpreads([spread('a')]);
    const d1 = deferred<ReturnType<typeof ok>>();
    mockedCall.mockReturnValueOnce(d1.promise as never);

    start(['a']);
    await tick();

    // Simulate resetSnapshot clearing the job while the call is in flight.
    store.setState((s: { sketchSpreadGenerateJob: unknown }) => {
      s.sketchSpreadGenerateJob = null;
    });
    d1.resolve(ok('a.png'));
    await tick();

    expect(effectiveUrl(store.getState().sketch.spreads[0])).toBeNull();
    expect(store.getState().sketchSpreadGenerateJob).toBeNull();
  });

  it('aborts when no snapshot id resolves after the initial flush (never calls the api)', async () => {
    ({ store, flushSnapshot } = createTestStore(null)); // meta.id stays null through the stubbed flush
    store.getState().setSketchSpreads([spread('a')]);
    mockedCall.mockResolvedValue(ok('a.png') as never);

    start(['a']);
    await tick();
    await tick();

    expect(flushSnapshot).toHaveBeenCalled();
    expect(mockedCall).not.toHaveBeenCalled();
    const job = store.getState().sketchSpreadGenerateJob;
    expect(job.status).toBe('completed');
    expect(job.tasks[0].status).toBe('pending'); // never ran
  });
});
