// store.test.ts — BackgroundJobsStore ingest fan-out, GC retention, seed
// reconcile, removeJob, subscribeJobs predicate filtering + unsubscribe, and
// cancelJob optimistic flag + rollback. Channel/top-up I/O is mocked away.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BackgroundJob, JobEvent } from '../types';

// Mock realtime + supabase so importing the store never touches a live client.
vi.mock('@/apis/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
    from: vi.fn(),
  },
}));
vi.mock('@/apis/supabase-realtime', () => ({ ensureRealtimeAuth: vi.fn() }));

const cancelJobRemote = vi.fn();
vi.mock('@/apis/jobs-api', () => ({ cancelJobRemote: (id: string) => cancelJobRemote(id) }));

import { useBackgroundJobsStore } from '../index';

function job(over: Partial<BackgroundJob> = {}): BackgroundJob {
  const now = new Date().toISOString();
  return {
    id: 'j1',
    type: 'remix_audio_swap',
    bookId: 'b1',
    userId: 'u1',
    status: 'queued',
    currentStep: 0,
    totalSteps: 3,
    stepDetails: null,
    params: { remix_id: 'r1' },
    result: null,
    cancelRequested: false,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

const store = () => useBackgroundJobsStore.getState();

beforeEach(() => {
  // teardown clears jobsById + listeners (channel handle is null in tests).
  store().teardown();
  cancelJobRemote.mockReset();
});

describe('ingest + fan-out', () => {
  it('upserts jobsById and fires matching listeners only', () => {
    const remixEvents: JobEvent[] = [];
    const exportEvents: JobEvent[] = [];
    store().subscribeJobs({ types: ['remix_audio_swap'] }, (e) => remixEvents.push(e));
    store().subscribeJobs({ types: ['export_pdf'] }, (e) => exportEvents.push(e));

    store().ingest([job({ id: 'a', type: 'remix_audio_swap' })]);

    expect(store().jobsById['a']).toBeDefined();
    expect(remixEvents).toHaveLength(1);
    expect(remixEvents[0].transition).toBe('appeared');
    expect(exportEvents).toHaveLength(0);
  });

  it('computes running/updated/terminal across ingests', () => {
    const events: JobEvent[] = [];
    store().subscribeJobs({ types: ['remix_audio_swap'] }, (e) => events.push(e));

    store().ingest([job({ id: 'a', status: 'queued' })]);
    store().ingest([job({ id: 'a', status: 'running' })]);
    store().ingest([job({ id: 'a', status: 'running', currentStep: 2 })]);
    store().ingest([job({ id: 'a', status: 'completed' })]);

    expect(events.map((e) => e.transition)).toEqual(['appeared', 'running', 'updated', 'terminal']);
    expect(events[3].prev?.status).toBe('running');
  });

  it('filters by remixId predicate', () => {
    const events: JobEvent[] = [];
    store().subscribeJobs({ remixId: 'r1' }, (e) => events.push(e));
    store().ingest([job({ id: 'a', params: { remix_id: 'r1' } })]);
    store().ingest([job({ id: 'b', params: { remix_id: 'r2' } })]);
    expect(events.map((e) => e.job.id)).toEqual(['a']);
  });
});

describe('seed', () => {
  it('appears as queued and reconciles by id on realtime upsert', () => {
    const events: JobEvent[] = [];
    store().subscribeJobs({ types: ['remix_audio_swap'] }, (e) => events.push(e));
    store().seed(job({ id: 'a', status: 'queued' }));
    store().ingest([job({ id: 'a', status: 'running' })]);
    expect(Object.keys(store().jobsById)).toEqual(['a']); // no duplicate
    expect(events.map((e) => e.transition)).toEqual(['appeared', 'running']);
  });
});

describe('gcRetention', () => {
  it('drops terminal jobs older than the window, keeps active + fresh terminal', () => {
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    store().ingest([
      job({ id: 'stale', status: 'completed', updatedAt: old }),
      job({ id: 'active', status: 'running' }),
      job({ id: 'fresh', status: 'completed' }),
    ]);
    const ids = Object.keys(store().jobsById).sort();
    expect(ids).toEqual(['active', 'fresh']);
  });

  it('fans a removed event for a GC-dropped job so consumers drop their copy', () => {
    const events: JobEvent[] = [];
    store().subscribeJobs({ types: ['remix_audio_swap'] }, (e) => events.push(e));
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    store().ingest([job({ id: 'stale', status: 'completed', updatedAt: old })]);
    // 'appeared' (ingest) then 'removed' (GC) for the same job, in order.
    expect(events.map((e) => e.transition)).toEqual(['appeared', 'removed']);
    expect(store().jobsById['stale']).toBeUndefined();
  });
});

describe('removeJob', () => {
  it('removes a row; no-op for unknown id', () => {
    store().ingest([job({ id: 'a' })]);
    store().removeJob('a');
    expect(store().jobsById['a']).toBeUndefined();
    expect(() => store().removeJob('nope')).not.toThrow();
  });

  it('fans out a removed event to matching listeners', () => {
    const events: JobEvent[] = [];
    store().ingest([job({ id: 'a' })]);
    store().subscribeJobs({ types: ['remix_audio_swap'] }, (e) => events.push(e));
    store().removeJob('a');
    expect(events).toHaveLength(1);
    expect(events[0].transition).toBe('removed');
    expect(events[0].job.id).toBe('a');
  });
});

describe('subscribeJobs unsubscribe', () => {
  it('stops receiving after unsubscribe', () => {
    const events: JobEvent[] = [];
    const unsub = store().subscribeJobs({ types: ['remix_audio_swap'] }, (e) => events.push(e));
    store().ingest([job({ id: 'a' })]);
    unsub();
    store().ingest([job({ id: 'a', status: 'running' })]);
    expect(events).toHaveLength(1);
  });
});

describe('cancelJob', () => {
  it('optimistically flips cancelRequested then keeps it on success', async () => {
    cancelJobRemote.mockResolvedValue({ success: true, data: { current_status: 'cancelled' } });
    store().ingest([job({ id: 'a', status: 'running' })]);
    await store().cancelJob('a');
    expect(store().jobsById['a'].cancelRequested).toBe(true);
    expect(cancelJobRemote).toHaveBeenCalledWith('a');
  });

  it('rolls back cancelRequested on failure', async () => {
    cancelJobRemote.mockResolvedValue({ success: false, error: 'nope', httpStatus: 500 });
    store().ingest([job({ id: 'a', status: 'running' })]);
    await expect(store().cancelJob('a')).rejects.toThrow('nope');
    expect(store().jobsById['a'].cancelRequested).toBe(false);
  });

  it('fans out an updated event so consumers reflect the optimistic flag', async () => {
    cancelJobRemote.mockResolvedValue({ success: true, data: { current_status: 'running' } });
    const events: JobEvent[] = [];
    store().ingest([job({ id: 'a', status: 'running' })]);
    store().subscribeJobs({ types: ['remix_audio_swap'] }, (e) => events.push(e));
    await store().cancelJob('a');
    expect(events.some((e) => e.job.cancelRequested && e.transition === 'updated')).toBe(true);
  });
});
