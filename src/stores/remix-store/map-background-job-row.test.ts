// map-background-job-row.test.ts — Unit tests for the row→RemixJob mapper,
// focused on the character_swap phase + characterKey (Phase 01 refactor).

import { describe, it, expect } from 'vitest';
import { mapRowToJob, mapBackgroundJobToRemixJob } from './map-background-job-row';
import type { BackgroundJobRow } from '@/types/remix';
import type { BackgroundJob } from '@/stores/background-jobs-store';

function row(overrides: Partial<BackgroundJobRow> = {}): BackgroundJobRow {
  return {
    id: 'job-1',
    type: 'remix_character_swap',
    user_id: 'u1',
    book_id: 'b1',
    status: 'queued',
    cancel_requested: false,
    total_steps: 3,
    current_step: 0,
    step_details: undefined,
    params: { remix_id: 'r1', character_key: 'elara' },
    result: null,
    created_at: '2026-05-23T00:00:00Z',
    updated_at: '2026-05-23T00:00:00Z',
    ...overrides,
  };
}

describe('mapRowToJob — type→phase lookup', () => {
  it('maps remix_character_swap → character_swap and surfaces characterKey', () => {
    const job = mapRowToJob(row());
    expect(job.phase).toBe('character_swap');
    expect(job.characterKey).toBe('elara');
    expect(job.remixId).toBe('r1');
  });

  it('maps audio type to audio phase', () => {
    expect(mapRowToJob(row({ type: 'remix_audio_swap' })).phase).toBe('audio');
  });

  it('falls back to audio for the retired remix_image_swap type', () => {
    // `image` phase removed (2026-05-30 — Inject is now client-side finalize).
    expect(mapRowToJob(row({ type: 'remix_image_swap' })).phase).toBe('audio');
  });

  it('falls back to audio for unknown types and leaves characterKey undefined', () => {
    const job = mapRowToJob(row({ type: 'remix_unknown', params: { remix_id: 'r1' } }));
    expect(job.phase).toBe('audio');
    expect(job.characterKey).toBeUndefined();
  });

  it('does NOT map the retired remix_entity_swap type (→ fallback audio)', () => {
    expect(mapRowToJob(row({ type: 'remix_entity_swap' })).phase).toBe('audio');
  });
});

// ── ADR-037 consumer adapter (BackgroundJob → RemixJob) ──────────────────────

function bgJob(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  return {
    id: 'job-9',
    type: 'remix_mix_swap',
    bookId: null,
    userId: 'u1',
    status: 'running',
    currentStep: 2,
    totalSteps: 4,
    stepDetails: { spreads: { s1: 'done' } },
    params: { remix_id: 'r9', batch_id: 'batch-3' },
    result: null,
    cancelRequested: false,
    createdAt: '2026-06-07T00:00:00Z',
    updatedAt: '2026-06-07T00:01:00Z',
    ...overrides,
  };
}

describe('mapBackgroundJobToRemixJob', () => {
  it('maps mix-swap fields incl. batchId + step progress', () => {
    const j = mapBackgroundJobToRemixJob(bgJob());
    expect(j.phase).toBe('remix_mix_swap');
    expect(j.remixId).toBe('r9');
    expect(j.batchId).toBe('batch-3');
    expect(j.currentStep).toBe(2);
    expect(j.totalSteps).toBe(4);
    expect(j.completedAt).toBeUndefined();
  });

  it('surfaces characterKey + triggeredBy from params', () => {
    const j = mapBackgroundJobToRemixJob(
      bgJob({
        type: 'remix_character_swap',
        params: { remix_id: 'r1', character_key: 'elara', triggered_by: 'auto-create' },
      }),
    );
    expect(j.phase).toBe('character_swap');
    expect(j.characterKey).toBe('elara');
    expect(j.triggeredBy).toBe('auto-create');
    expect(j.batchId).toBeUndefined();
  });

  it('sets completedAt = updatedAt on terminal status', () => {
    const j = mapBackgroundJobToRemixJob(bgJob({ status: 'completed' }));
    expect(j.completedAt).toBe('2026-06-07T00:01:00Z');
  });

  it('defaults remixId to empty string + audio phase when params absent', () => {
    const j = mapBackgroundJobToRemixJob(bgJob({ type: 'remix_audio_swap', params: null }));
    expect(j.phase).toBe('audio');
    expect(j.remixId).toBe('');
    expect(j.triggeredBy).toBe('user');
  });
});
