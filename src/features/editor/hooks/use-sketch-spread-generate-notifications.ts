// use-sketch-spread-generate-notifications.ts — watches the sketch SPREAD-image generate job and
// fires one summary toast when it transitions running → terminal (completed | cancelled), then
// dismisses the job. Mount once at editor-page level (like use-sketch-generate-notifications) so
// the toast fires regardless of which creative space is active.

import { useEffect, useRef } from 'react';
import { useSnapshotStore } from '@/stores/snapshot-store';
import type { SketchSpreadGenerateJob } from '@/stores/snapshot-store/types';
import { summarizeGenerateJob, generateSummarySuffix } from './generate-summary-toast';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchSpreadGenerateNotifications');

/**
 * Side-effect-only hook. `job` is the store's stable ref; after dismiss the job becomes null on the
 * next render, and prevRef holds the terminal ref — so the transition guard (prev.status==='running'
 * && same id && job.status!=='running') fires exactly once (no double-toast).
 */
export function useSketchSpreadGenerateNotifications(): void {
  const prevRef = useRef<SketchSpreadGenerateJob | null>(null);
  const job = useSnapshotStore((s) => s.sketchSpreadGenerateJob);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev?.status === 'running' && job && job.id === prev.id && job.status !== 'running') {
      const { done, skipped, fail, total } = summarizeGenerateJob(job);
      const suffix = generateSummarySuffix(skipped, fail);

      if (done === 0 && fail === 0 && skipped === 0) {
        // Terminal without any task producing a result (aborted before running — e.g. no snapshot
        // id, or cancelled immediately). The abort path already toasted; a "0/N generated" summary
        // here would be misleading (and double-toast the error). Dismiss silently.
        log.debug('toast', 'terminal with no results — skip summary toast', {
          jobId: job.id,
          status: job.status,
        });
      } else if (job.status === 'cancelled') {
        log.info('toast', 'job cancelled', { jobId: job.id, done, skipped, total });
        toast.info(`Cancelled — ${done}/${total} spreads generated${suffix}`);
      } else if (fail > 0 || skipped > 0) {
        log.warn('toast', 'job completed with skips/failures', { jobId: job.id, done, skipped, fail, total });
        toast.warning(`${done}/${total} spreads generated${suffix}`);
      } else {
        log.info('toast', 'job completed', { jobId: job.id, done, total });
        toast.success(`${done}/${total} spreads generated`);
      }

      useSnapshotStore.getState().dismissSketchSpreadGenerateJob();
    }
    prevRef.current = job;
  }, [job]);
}
