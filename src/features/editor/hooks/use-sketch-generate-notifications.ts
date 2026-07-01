// use-sketch-generate-notifications.ts — watches the sketch generate job and fires one summary
// toast when it transitions running → terminal (completed | cancelled), then dismisses the job.
// Mount once at editor-page level (like use-image-task-notifications) so the toast fires
// regardless of which creative space is active.

import { useEffect, useRef } from 'react';
import { useSnapshotStore } from '@/stores/snapshot-store';
import type { SketchGenerateJob } from '@/stores/snapshot-store/types';
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
      const done = job.tasks.filter((t) => t.status === 'completed').length;
      const fail = job.tasks.filter((t) => t.status === 'error').length;
      const total = job.tasks.length;

      if (job.status === 'cancelled') {
        log.info('toast', 'job cancelled', { jobId: job.id, done, total });
        toast.info(`Sketch generation cancelled — ${done}/${total} done`);
      } else if (fail > 0) {
        log.warn('toast', 'job completed with failures', { jobId: job.id, done, fail, total });
        toast.warning(`${done}/${total} sheets generated · ${fail} failed`);
      } else {
        log.info('toast', 'job completed', { jobId: job.id, done, total });
        toast.success(`${done}/${total} sheets generated`);
      }

      useSnapshotStore.getState().dismissSketchGenerateJob();
    }
    prevRef.current = job;
  }, [job]);
}
