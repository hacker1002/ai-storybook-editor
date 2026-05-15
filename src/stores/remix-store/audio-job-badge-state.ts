// audio-job-badge-state.ts — Pure derive function + selector hook mapping the
// latest audio RemixJob for a remix into one of 7 AudioJobBadgeState variants.
// Component AudioJobBadge consumes the resulting state directly; render is
// dumb. Decision table: see Phase 03 plan §Kiến trúc.

import { useShallow } from 'zustand/react/shallow';
import { useRemixStore } from './index';
import { createLogger } from '@/utils/logger';
import type {
  AudioJobBadgeState,
  RemixJob,
  RemixJobResult,
} from '@/types/remix';

const log = createLogger('Store', 'AudioJobBadgeState');

/** Return the latest (by createdAt DESC) audio-phase job for a remix, or null. */
export function pickLatestAudioJob(
  jobs: RemixJob[],
  remixId: string,
): RemixJob | null {
  let latest: RemixJob | null = null;
  for (const j of jobs) {
    if (j.remixId !== remixId || j.phase !== 'audio') continue;
    if (latest === null || j.createdAt > latest.createdAt) {
      latest = j;
    }
  }
  return latest;
}

function firstErrorMessage(result: RemixJobResult | undefined): string {
  const errs = result?.errors;
  if (!errs || errs.length === 0) return 'Unknown error';
  return errs[0].message ?? 'Unknown error';
}

/** Pure derive — no I/O, no store access. */
export function deriveAudioJobBadgeState(
  job: RemixJob | null,
): AudioJobBadgeState {
  if (job === null) {
    return { kind: 'hidden' };
  }

  const errorCount = job.result?.errors?.length ?? 0;

  // Completed clean → hide badge (auto-dismissed by notifications hook).
  if (job.status === 'completed' && errorCount === 0) {
    return { kind: 'hidden' };
  }

  // Cancel-requested but not yet flipped to terminal → cancelling.
  if (
    job.cancelRequested &&
    (job.status === 'queued' || job.status === 'running')
  ) {
    return { kind: 'cancelling', jobId: job.id };
  }

  switch (job.status) {
    case 'queued':
      return { kind: 'queued', jobId: job.id };
    case 'running':
      return {
        kind: 'running',
        jobId: job.id,
        current: job.currentStep,
        total: job.totalSteps,
      };
    case 'cancelled':
      return {
        kind: 'cancelled',
        jobId: job.id,
        completedAt: job.completedAt ?? job.updatedAt,
      };
    case 'completed':
      // errorCount > 0 implied here (clean-complete branched out above)
      return {
        kind: 'partial',
        jobId: job.id,
        errorCount,
        completedAt: job.completedAt ?? job.updatedAt,
      };
    case 'failed':
      return {
        kind: 'failed',
        jobId: job.id,
        message: firstErrorMessage(job.result),
      };
    default:
      log.warn('deriveAudioJobBadgeState', 'unknown status', {
        jobId: job.id,
        status: job.status,
      });
      return { kind: 'hidden' };
  }
}

/** Reactive selector hook — re-renders only when derived state shape changes.
 *  useShallow is required: deriveAudioJobBadgeState returns a fresh object
 *  literal each call, so the default Object.is equality would treat every
 *  store tick as a change and trigger React 19's infinite-snapshot bail-out. */
export function useAudioJobBadgeState(remixId: string): AudioJobBadgeState {
  return useRemixStore(
    useShallow((s) =>
      deriveAudioJobBadgeState(pickLatestAudioJob(s.jobs, remixId)),
    ),
  );
}
