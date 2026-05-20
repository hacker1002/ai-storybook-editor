// use-remix-job-notifications.ts — Watches the remix-store `jobs` slice and
// fires toast notifications when a job transitions from active (queued/running)
// to terminal (completed/failed/cancelled). Clean-complete success toasts also
// schedule auto-dismiss of the job row 30s later so the badge disappears.
// Mount once at the editor page level. Side-effect only — no rendering.
// Spec: ai-storybook-design/component/stores/remix-store.md §8

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useRemixStore } from '@/stores/remix-store';
import type { RemixJob } from '@/types/remix';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'RemixJobNotifications');

const AUTO_DISMISS_MS = 30_000;

const ACTIVE_STATUSES = new Set<RemixJob['status']>(['queued', 'running']);
const TERMINAL_STATUSES = new Set<RemixJob['status']>([
  'completed',
  'failed',
  'cancelled',
]);

export function useRemixJobNotifications(): void {
  const jobs = useRemixStore((s) => s.jobs);
  const prevJobsRef = useRef<RemixJob[]>([]);
  const dismissTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Clear all pending auto-dismiss timers on unmount to avoid leaks.
  useEffect(() => {
    const timers = dismissTimersRef.current;
    return () => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const prev = prevJobsRef.current;

    const transitioned = jobs.filter((curr) => {
      const old = prev.find((p) => p.id === curr.id);
      if (!old) return false;
      return ACTIVE_STATUSES.has(old.status) && TERMINAL_STATUSES.has(curr.status);
    });

    if (transitioned.length > 0) {
      // Read remixes synchronously from store to look up display names.
      const remixes = useRemixStore.getState().remixes;

      for (const job of transitioned) {
        const remix = remixes.find((r) => r.id === job.remixId);
        const name = remix?.name ?? 'Untitled';
        const label =
          job.phase === 'audio'
            ? 'Audio'
            : job.phase === 'image'
              ? 'Inject'
              : job.phase === 'entity_swap'
                ? 'Swap entity'
                : 'Job';
        const errorCount = job.result?.errors?.length ?? 0;

        switch (job.status) {
          case 'completed':
            if (errorCount > 0) {
              log.warn('toast', 'partial complete', {
                jobId: job.id,
                phase: job.phase,
                errorCount,
              });
              toast.warning(
                `${label} finished with ${errorCount} warnings for "${name}" — check sidebar`,
              );
            } else {
              log.info('toast', 'success', { jobId: job.id, phase: job.phase });
              toast.success(`${label} updated for "${name}"`);
              // Auto-dismiss clean-complete after 30s so the badge disappears.
              const timerId = setTimeout(() => {
                dismissTimersRef.current.delete(timerId);
                useRemixStore.getState().dismissJob(job.id);
              }, AUTO_DISMISS_MS);
              dismissTimersRef.current.add(timerId);
            }
            break;
          case 'failed': {
            const message = job.result?.errors?.[0]?.message ?? 'Unknown error';
            log.warn('toast', 'failed', {
              jobId: job.id,
              phase: job.phase,
              errorCount,
            });
            toast.error(`${label} failed for "${name}": ${message}`);
            break;
          }
          case 'cancelled':
            log.info('toast', 'cancelled', { jobId: job.id, phase: job.phase });
            toast.info(`${label} generation cancelled`);
            break;
          default:
            break;
        }
      }
    }

    prevJobsRef.current = jobs;
  }, [jobs]);
}
