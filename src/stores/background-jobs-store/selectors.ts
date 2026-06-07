// background-jobs-store/selectors.ts — Reactive read-side hooks. Kept separate
// from the imperative `subscribeJobs` API. Memoization is keyed on the stable
// `jobsById` ref (never on a freshly-mapped array — that would loop under a
// shallow compare; memory feedback_zustand_useshallow_nested_arrays).

import { useMemo } from 'react';
import { matches } from './ingest';
import { ACTIVE_STATUSES, type BackgroundJob, type JobPredicate } from './types';
import { useBackgroundJobsStore } from './index';

/** Serializable identity of a predicate's matchable fields. `match` (a fn) can't
 *  be serialized — callers passing `match` MUST memoize the predicate object. */
function predicateKey(predicate: JobPredicate): string {
  return `${predicate.types?.join(',') ?? ''}|${predicate.bookId ?? ''}|${predicate.remixId ?? ''}`;
}

/** All jobs matching the predicate. Recomputed only when `jobsById` or the
 *  predicate's serializable fields change. */
export function useJobsBy(predicate: JobPredicate): BackgroundJob[] {
  const jobsById = useBackgroundJobsStore((s) => s.jobsById);
  const key = predicateKey(predicate);
  return useMemo(
    () => Object.values(jobsById).filter((j) => matches(predicate, j)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobsById, key],
  );
}

/** First active (queued|running) job matching the predicate, else null. */
export function useActiveJob(predicate: JobPredicate): BackgroundJob | null {
  const jobs = useJobsBy(predicate);
  return useMemo(
    () => jobs.find((j) => ACTIVE_STATUSES.has(j.status)) ?? null,
    [jobs],
  );
}

/** A single job by id — id-based, ref-stable until that row changes. */
export function useJob(id: string | null | undefined): BackgroundJob | null {
  return useBackgroundJobsStore((s) => (id ? s.jobsById[id] ?? null : null));
}
