// use-sketch-generate-notifications.ts — watches the sketch generate job and fires one summary
// toast when it transitions running → terminal (completed | cancelled), then dismisses the job.
// Mount once at editor-page level (like use-image-task-notifications) so the toast fires
// regardless of which creative space is active.

import { useEffect, useRef } from 'react';
import { useSnapshotStore } from '@/stores/snapshot-store';
import type { SketchGenerateJob } from '@/stores/snapshot-store/types';
import { summarizeGenerateJob, generateSummarySuffix } from './generate-summary-toast';
import { toast } from 'sonner';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchGenerateNotifications');

/**
 * Side-effect-only hook. `job` is the store's stable ref; after dismiss the job becomes null on the
 * next render, and prevRef holds the terminal ref — so the transition guard (prev.status==='running'
 * && same id && job.status!=='running') fires exactly once (no double-toast).
 */
export function useSketchGenerateNotifications(): void {
  const prevRef = useRef<SketchGenerateJob | null>(null);
  const job = useSnapshotStore((s) => s.sketchGenerateJob);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev?.status === 'running' && job && job.id === prev.id && job.status !== 'running') {
      const { done, skipped, fail, total } = summarizeGenerateJob(job);
      const suffix = generateSummarySuffix(skipped, fail);
      // role="status" (polite) is provided by the Sonner Toaster's aria-live region.
      if (job.status === 'cancelled') {
        log.info('toast', 'job cancelled', { jobId: job.id, done, skipped, total });
        toast.info(`Sketch generation cancelled — ${done}/${total} done${suffix}`);
      } else if (fail > 0 || skipped > 0) {
        log.warn('toast', 'job completed with skips/failures', { jobId: job.id, done, skipped, fail, total });
        toast.warning(`${done}/${total} sheets generated${suffix}`);
      } else {
        log.info('toast', 'job completed', { jobId: job.id, done, total });
        toast.success(`${done}/${total} sheets generated`);
      }

      useSnapshotStore.getState().dismissSketchGenerateJob();
    }
    prevRef.current = job;
  }, [job]);
}
