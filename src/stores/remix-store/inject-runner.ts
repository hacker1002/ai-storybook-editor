// inject-runner.ts — Inert no-op per Validation Session 1.
// Text swap now happens synchronously in createRemix (Phase 1). Audio regen
// (Phase 2) + image inject (Phase 3) backend not shipped — runner is a stub
// kept only to avoid breaking the store's `startInjectJob` wiring. Re-enabled
// when Phase 3 lands; will be renamed `image-job-runner.ts`.

import { createLogger } from '@/utils/logger';
import type { useRemixStore } from '../remix-store';

const log = createLogger('Store', 'InjectRunner');

export type RemixStoreApi = typeof useRemixStore;

export async function runInjectJob(
  jobId: string,
  store: RemixStoreApi,
): Promise<void> {
  void store;
  log.debug('runInjectJob', 'no-op (Phase 2/3 backend pending)', { jobId });
}
