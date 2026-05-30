// map-background-job-row.test.ts — Unit tests for the row→RemixJob mapper,
// focused on the character_swap phase + characterKey (Phase 01 refactor).

import { describe, it, expect } from 'vitest';
import { mapRowToJob } from './map-background-job-row';
import type { BackgroundJobRow } from '@/types/remix';

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
