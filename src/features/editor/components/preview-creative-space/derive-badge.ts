// derive-badge.ts — Map latest audio RemixJob state to a PreviewSourceBadge
// for the PlayerHeader dropdown. Updated for Phase 2 store migration:
// consumes `RemixJob` (DB-row-parity, phase='audio') instead of legacy InjectJob.
// Image variant is not wired here — Phase 3 will add image-job derive.
//
// Reference: plans/260514-1145-preview-space-remix-source-switching/phase-01
//            plans/260515-1437-remix-phase2-audio-swap-frontend/plan.md

import type { RemixJob } from '@/types/remix';

export type PreviewSourceBadge =
  | { kind: 'none' }
  | { kind: 'audio-regenerating' }
  | { kind: 'audio-error' }
  | { kind: 'image-not-injected' }
  | { kind: 'image-regenerating' }
  | { kind: 'image-error' };

/** Derive badge state from the latest audio job for a remix.
 *  Maps DB enum (queued/running/completed/failed/cancelled) + derived partial
 *  to a v1-collapsed PreviewSourceBadge (audio variants only). */
export function deriveBadge(latestJob: RemixJob | null): PreviewSourceBadge {
  if (latestJob === null) {
    return { kind: 'image-not-injected' };
  }

  const errorCount = latestJob.result?.errors?.length ?? 0;

  switch (latestJob.status) {
    case 'queued':
    case 'running':
      return { kind: 'audio-regenerating' };
    case 'failed':
      return { kind: 'audio-error' };
    case 'completed':
      return errorCount > 0 ? { kind: 'audio-error' } : { kind: 'none' };
    case 'cancelled':
      return { kind: 'image-not-injected' };
    default:
      return { kind: 'image-not-injected' };
  }
}
