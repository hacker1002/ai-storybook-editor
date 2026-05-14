// derive-badge.ts — Map InjectJob state to a PreviewSourceBadge for the
// PlayerHeader dropdown.
//
// v1 collapses spec's separate audio-* / image-* variants into image-* only,
// because the current InjectJob model is unified (no `phase` field). A follow-up
// plan will migrate the store to a `jobs[]` model with explicit audio/image
// phases — at that point we'll add `useLatestAudioJob` / `useLatestImageJob`
// selectors and re-enable the audio variants here.
//
// Reference: plans/260514-1145-preview-space-remix-source-switching/phase-01

import type { InjectJob } from '@/types/remix';

export type PreviewSourceBadge =
  | { kind: 'none' }
  | { kind: 'audio-regenerating' }
  | { kind: 'audio-error' }
  | { kind: 'image-not-injected' }
  | { kind: 'image-regenerating' }
  | { kind: 'image-error' };

/** Derive badge state from the latest inject job for a remix (v1 collapses audio/image). */
export function deriveBadge(latestInjectJob: InjectJob | null): PreviewSourceBadge {
  if (latestInjectJob === null) {
    return { kind: 'image-not-injected' };
  }

  switch (latestInjectJob.status) {
    case 'pending':
    case 'running':
      return { kind: 'image-regenerating' };
    case 'error':
    case 'partial-error':
      return { kind: 'image-error' };
    case 'cancelled':
      return { kind: 'image-not-injected' };
    case 'completed':
      return { kind: 'none' };
    default:
      return { kind: 'image-not-injected' };
  }
}
