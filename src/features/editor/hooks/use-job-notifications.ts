// use-job-notifications.ts — Single app-root toast hook for ALL background jobs
// (ADR-037 §6.3). Merges the former useRemixJobNotifications (remix swap copy)
// with export/render/transcode copy. Subscribes to the unified store's terminal
// transitions; a new job type = one new TOAST_COPY branch, NOT a new hook/channel.
//
// Mounted once at the app root (App.tsx) so toasts fire even outside the editor.
// Remix-specific copy resolves remix.name via the RemixStore lookup with a
// generic fallback when the store isn't hydrated (outside the editor).

import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  EXPORT_TYPES,
  REMIX_SWAP_TYPES,
  useBackgroundJobsStore,
  type BackgroundJob,
  type JobEvent,
} from '@/stores/background-jobs-store';
import { useRemixStore } from '@/stores/remix-store';
import { createLogger } from '@/utils/logger';

const log = createLogger('App', 'JobNotifications');

const AUTO_DISMISS_MS = 30_000;
const TOAST_TYPES = [...REMIX_SWAP_TYPES, ...EXPORT_TYPES];
const REMIX_TYPE_SET = new Set<string>(REMIX_SWAP_TYPES);

type Tone = 'success' | 'error' | 'info' | 'warning';
interface ToastCopy {
  tone: Tone;
  message: string;
  /** Clean-complete success → schedule 30s shared removeJob so the badge clears. */
  autoDismiss?: boolean;
}

/** Resolve a remix's display name via the RemixStore; generic fallback when the
 *  store isn't hydrated (toast fired outside the editor). */
function resolveRemixName(remixId: string | undefined): string {
  if (!remixId) return 'Remix';
  const remix = useRemixStore.getState().remixes.find((r) => r.id === remixId);
  return remix?.name || 'Remix';
}

function remixCopy(job: BackgroundJob): ToastCopy {
  const params = job.params ?? {};
  const remixId = typeof params.remix_id === 'string' ? params.remix_id : undefined;
  const name = resolveRemixName(remixId);
  const label =
    job.type === 'remix_audio_swap'
      ? 'Audio'
      : job.type === 'remix_mix_swap'
        ? 'Batch swap'
        : job.type === 'remix_sprite_swap'
          ? 'Variant swap'
          : 'Job';

  const result = (job.result ?? {}) as { errors?: { message?: string }[]; failed_sheets?: number };
  const errorCount = Array.isArray(result.errors) ? result.errors.length : 0;
  const failedSheets =
    typeof result.failed_sheets === 'number' ? result.failed_sheets : errorCount;

  switch (job.status) {
    case 'completed':
      if (errorCount > 0) {
        return {
          tone: 'warning',
          message: `${label} finished with ${failedSheets} warnings for "${name}" — check sidebar`,
        };
      }
      return { tone: 'success', message: `${label} updated for "${name}"`, autoDismiss: true };
    case 'failed': {
      const message = result.errors?.[0]?.message ?? 'Unknown error';
      return { tone: 'error', message: `${label} failed for "${name}": ${message}` };
    }
    case 'cancelled':
      return { tone: 'info', message: `${label} generation cancelled` };
    default:
      return { tone: 'info', message: `${label} update` };
  }
}

function exportCopy(job: BackgroundJob): ToastCopy {
  const kind =
    job.type === 'export_pdf'
      ? 'PDF'
      : job.type === 'render_book_video'
        ? 'Video (QHD)'
        : 'Video qualities';

  switch (job.status) {
    case 'completed': {
      const result = (job.result ?? {}) as { errors?: unknown[] };
      const errs = Array.isArray(result.errors) ? result.errors.length : 0;
      if (errs > 0) return { tone: 'warning', message: `${kind} finished with ${errs} warnings.` };
      const okMsg =
        job.type === 'export_pdf'
          ? 'PDF exported.'
          : job.type === 'render_book_video'
            ? 'Video rendered (QHD).'
            : 'Video qualities ready (SD/HD/FHD).';
      return { tone: 'success', message: okMsg };
    }
    case 'failed':
      return { tone: 'error', message: `${kind} failed.` };
    case 'cancelled':
      return { tone: 'info', message: `${kind} cancelled.` };
    default:
      return { tone: 'info', message: `${kind} update` };
  }
}

function buildCopy(job: BackgroundJob): ToastCopy {
  return REMIX_TYPE_SET.has(job.type) ? remixCopy(job) : exportCopy(job);
}

/** Mount once at the app root. Side-effect only — no render. */
export function useJobNotifications(): void {
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const onEvent = (e: JobEvent) => {
      if (e.transition !== 'terminal') return;
      const copy = buildCopy(e.job);
      log.info('toast', 'terminal job', {
        jobId: e.job.id,
        type: e.job.type,
        status: e.job.status,
        tone: copy.tone,
      });
      toast[copy.tone](copy.message);

      // Sprite-swap terminal — refetch the authoritative remix so the updated
      // `sprites` blob (carrying is_final winners) lands even when the modal is
      // closed / a non-active sprite finished. Display `visualSwapUrl` then
      // re-derives client-side (`useRemixVariants` → `resolveSpriteFinals`); the
      // FE no longer writes the dead `visual_swap_url` column. Fire-and-forget.
      if (e.job.type === 'remix_sprite_swap' && e.job.status === 'completed') {
        const remixId =
          typeof e.job.params?.remix_id === 'string' ? e.job.params.remix_id : undefined;
        if (remixId) {
          void useRemixStore
            .getState()
            .refetchRemix(remixId)
            .catch((err) =>
              log.warn('refetchRemix', 'sprite-swap terminal refetch failed', {
                remixId,
                error: err instanceof Error ? err.message : String(err),
              }),
            );
        }
      }

      if (copy.autoDismiss) {
        const id = setTimeout(() => {
          timers.delete(id);
          // Shared removeJob (generic) → fans 'removed' so consumers' badges clear.
          useBackgroundJobsStore.getState().removeJob(e.job.id);
        }, AUTO_DISMISS_MS);
        timers.add(id);
      }
    };

    const unsubscribe = useBackgroundJobsStore
      .getState()
      .subscribeJobs({ types: TOAST_TYPES }, onEvent);

    return () => {
      unsubscribe();
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);
}
