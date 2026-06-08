// prune-superseded-jobs.test.ts — A newer swap attempt supersedes older ones of
// the same lineage (remixId + phase + characterKey). Regression: a stale
// completed-with-errors job lingered (never auto-dismissed) and resurrected the
// error banner once the newer CLEAN job was auto-dismissed 30s after success.

import { describe, it, expect } from 'vitest';
import { pruneSupersededJobs } from './slice-helpers';
import type { RemixJob, RemixJobStatus } from '@/types/remix';

function job(overrides: Partial<RemixJob> = {}): RemixJob {
  return {
    id: 'j1',
    remixId: 'r1',
    phase: 'remix_mix_swap',
    characterKey: 'leela',
    triggeredBy: 'user',
    status: 'completed' as RemixJobStatus,
    currentStep: 2,
    totalSteps: 2,
    cancelRequested: false,
    createdAt: '2026-05-23T00:00:00Z',
    updatedAt: '2026-05-23T00:00:00Z',
    ...overrides,
  };
}

describe('pruneSupersededJobs', () => {
  it('keeps only the latest job per (remixId, phase, characterKey) lineage', () => {
    const oldFailed = job({
      id: 'old',
      createdAt: '2026-05-23T03:36:04+00:00',
      result: { errors: [{ stage: 'swap', message: 'x' }], failed_sheets: 2 },
    });
    const newClean = job({
      id: 'new',
      createdAt: '2026-05-23T04:02:25+00:00',
      result: { errors: [], failed_sheets: 0 },
    });

    const out = pruneSupersededJobs([oldFailed, newClean]);

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('new');
  });

  it('does not merge different characters of the same remix', () => {
    const leela = job({ id: 'a', characterKey: 'leela' });
    const milo = job({ id: 'b', characterKey: 'milo' });
    const out = pruneSupersededJobs([leela, milo]);
    expect(out.map((j) => j.id).sort()).toEqual(['a', 'b']);
  });

  it('does not merge different remixes', () => {
    const r1 = job({ id: 'a', remixId: 'r1' });
    const r2 = job({ id: 'b', remixId: 'r2' });
    expect(pruneSupersededJobs([r1, r2])).toHaveLength(2);
  });

  it('folds audio jobs (no characterKey) by remix+phase → keeps latest', () => {
    const oldAudio = job({
      id: 'a',
      phase: 'audio',
      characterKey: undefined,
      createdAt: '2026-05-23T01:00:00Z',
    });
    const newAudio = job({
      id: 'b',
      phase: 'audio',
      characterKey: undefined,
      createdAt: '2026-05-23T02:00:00Z',
    });
    const out = pruneSupersededJobs([oldAudio, newAudio]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('b');
  });

  it('returns the SAME array reference when nothing is pruned', () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b', characterKey: 'milo' })];
    expect(pruneSupersededJobs(jobs)).toBe(jobs);
  });

  it('preserves original order among survivors', () => {
    const jobs = [
      job({ id: 'milo', characterKey: 'milo', createdAt: '2026-05-23T05:00:00Z' }),
      job({ id: 'leela-old', characterKey: 'leela', createdAt: '2026-05-23T01:00:00Z' }),
      job({ id: 'leela-new', characterKey: 'leela', createdAt: '2026-05-23T09:00:00Z' }),
    ];
    const out = pruneSupersededJobs(jobs);
    expect(out.map((j) => j.id)).toEqual(['milo', 'leela-new']);
  });
});
