// ingest.test.ts — Pure ingest helpers: row mapping, transition classify, match.

import { describe, it, expect } from 'vitest';
import {
  classifyTransition,
  mapRowToBackgroundJob,
  matches,
} from '../ingest';
import type { BackgroundJob, BackgroundJobRawRow } from '../types';

function row(over: Partial<BackgroundJobRawRow> = {}): BackgroundJobRawRow {
  return {
    id: 'j1',
    type: 'render_book_video',
    user_id: 'u1',
    book_id: 'b1',
    status: 'queued',
    cancel_requested: false,
    total_steps: 5,
    current_step: 0,
    step_details: null,
    params: { remix_id: 'r1', edition: 'classic' },
    result: null,
    created_at: '2026-06-07T00:00:00Z',
    updated_at: '2026-06-07T00:00:00Z',
    ...over,
  };
}

function job(over: Partial<BackgroundJob> = {}): BackgroundJob {
  return { ...mapRowToBackgroundJob(row()), ...over };
}

describe('mapRowToBackgroundJob', () => {
  it('camel-cases + preserves raw params/result passthrough', () => {
    const j = mapRowToBackgroundJob(
      row({ book_id: null, current_step: 3, cancel_requested: true, params: { remix_id: 'rX' } }),
    );
    expect(j.bookId).toBeNull();
    expect(j.currentStep).toBe(3);
    expect(j.cancelRequested).toBe(true);
    expect(j.params).toEqual({ remix_id: 'rX' });
  });

  it('defaults null numeric/json fields', () => {
    const j = mapRowToBackgroundJob(
      row({ total_steps: null, current_step: null, step_details: null, params: null, result: null }),
    );
    expect(j.totalSteps).toBe(0);
    expect(j.currentStep).toBe(0);
    expect(j.stepDetails).toBeNull();
    expect(j.params).toBeNull();
  });
});

describe('classifyTransition', () => {
  it('appeared when prev is null', () => {
    expect(classifyTransition(null, job({ status: 'queued' }))).toBe('appeared');
    // first observation already terminal is still "appeared" (not terminal)
    expect(classifyTransition(null, job({ status: 'completed' }))).toBe('appeared');
  });

  it('running on queued → running', () => {
    expect(classifyTransition(job({ status: 'queued' }), job({ status: 'running' }))).toBe('running');
  });

  it('updated on running → running', () => {
    expect(
      classifyTransition(job({ status: 'running', currentStep: 1 }), job({ status: 'running', currentStep: 2 })),
    ).toBe('updated');
  });

  it('terminal on active → terminal', () => {
    expect(classifyTransition(job({ status: 'running' }), job({ status: 'completed' }))).toBe('terminal');
    expect(classifyTransition(job({ status: 'queued' }), job({ status: 'failed' }))).toBe('terminal');
    expect(classifyTransition(job({ status: 'running' }), job({ status: 'cancelled' }))).toBe('terminal');
  });
});

describe('matches', () => {
  it('types allowlist', () => {
    expect(matches({ types: ['render_book_video'] }, job())).toBe(true);
    expect(matches({ types: ['export_pdf'] }, job())).toBe(false);
  });

  it('bookId (undefined ignores; null matches null)', () => {
    expect(matches({ bookId: 'b1' }, job())).toBe(true);
    expect(matches({ bookId: 'bX' }, job())).toBe(false);
    expect(matches({}, job())).toBe(true);
    expect(matches({ bookId: null }, job({ bookId: null }))).toBe(true);
  });

  it('remixId via params.remix_id', () => {
    expect(matches({ remixId: 'r1' }, job())).toBe(true);
    expect(matches({ remixId: 'rX' }, job())).toBe(false);
    expect(matches({ remixId: 'r1' }, job({ params: null }))).toBe(false);
  });

  it('combined predicate is AND', () => {
    expect(matches({ types: ['render_book_video'], remixId: 'r1' }, job())).toBe(true);
    expect(matches({ types: ['render_book_video'], remixId: 'rX' }, job())).toBe(false);
  });

  it('match escape hatch', () => {
    expect(matches({ match: (j) => j.totalSteps === 5 }, job())).toBe(true);
    expect(matches({ match: (j) => j.totalSteps === 99 }, job())).toBe(false);
  });
});
