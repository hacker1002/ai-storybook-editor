// CollaboratorActivityLogTab — per-collaborator audit log (filter `actor_user_id`).
// Read-only, newest-first by default. Filters (type multi-select + time single-select
// + sort) push down to the query (use-activity-logs); the message is rendered
// client-side from `(action_type + target_ref)` + a fallback verb (activity-log-consts).
//
// Infinite scroll = an IntersectionObserver sentinel at the list foot calling the
// hook's cursor-based `loadMore` (created_at cursor, never offset). The observer is
// (re)wired in an effect keyed on `hasMore` + `loadMore` — reading `sentinelRef.current`
// in the effect (not render) is React-19 safe.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createLogger } from '@/utils/logger';
import { useActivityLogs } from './hooks/use-activity-logs';
import { ActivityLogFilterBar } from './activity-log-filter-bar';
import { ACTION_META, activityMessage, formatLogTimestamp, type ActivityLog, type TimeRange } from './activity-log-consts';

const log = createLogger('Editor', 'CollaboratorActivityLogTab');

interface CollaboratorActivityLogTabProps {
  bookId: string;
  actorUserId: string;
}

export function CollaboratorActivityLogTab({ bookId, actorUserId }: CollaboratorActivityLogTabProps) {
  const [typeFilter, setTypeFilter] = useState<number[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeRange>('all');
  const [sortDesc, setSortDesc] = useState(true);

  const { logs, isLoading, isLoadingMore, hasMore, error, loadMore } = useActivityLogs({
    bookId,
    actorUserId,
    typeFilter,
    timeFilter,
    sortDesc,
  });

  const hasActiveFilter = typeFilter.length > 0 || timeFilter !== 'all';

  // Infinite-scroll sentinel → loadMore when it enters view.
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          log.debug('observer', 'sentinel visible, loading more');
          loadMore();
        }
      },
      { rootMargin: '160px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const clearFilters = () => {
    log.debug('clearFilters', 'clearing filters');
    setTypeFilter([]);
    setTimeFilter('all');
  };

  return (
    <div className="flex h-full flex-col">
      <ActivityLogFilterBar
        typeFilter={typeFilter}
        timeFilter={timeFilter}
        sortDesc={sortDesc}
        onTypeChange={setTypeFilter}
        onTimeChange={setTimeFilter}
        onSortToggle={() => setSortDesc((v) => !v)}
      />

      <div className="flex-1 overflow-auto" role="tabpanel">
        {isLoading ? (
          <LogSkeleton />
        ) : logs.length > 0 ? (
          // A non-empty list always wins over a paging `error` — a failed load-more must
          // NOT blank the already-loaded rows; it degrades to an inline retry footer.
          <ul className="divide-y">
            {logs.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
            {error ? (
              <li className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
                <span>Couldn&apos;t load more.</span>
                <button type="button" onClick={loadMore} className="rounded-md border px-2 py-1 hover:bg-muted/60">
                  Retry
                </button>
              </li>
            ) : (
              <li ref={sentinelRef} aria-hidden="true" />
            )}
            {isLoadingMore && <li className="p-3 text-center text-xs text-muted-foreground">Loading…</li>}
          </ul>
        ) : error ? (
          <EmptyState title="Couldn't load activity" subtitle="Please try again." />
        ) : hasActiveFilter ? (
          <EmptyState
            title="No activity matches these filters"
            action={
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/60"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState title="No activity yet" />
        )}
      </div>
    </div>
  );
}

/** One audit row: action icon · message (verb + target) · timestamp · action label. */
function LogRow({ entry }: { entry: ActivityLog }) {
  const meta = ACTION_META[entry.action_type];
  const Icon = meta?.Icon;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{activityMessage(entry)}</p>
        <p className="text-xs text-muted-foreground">{formatLogTimestamp(entry.created_at)}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{meta?.label ?? `#${entry.action_type}`}</span>
    </li>
  );
}

/** Loading skeleton rows. */
function LogSkeleton() {
  return (
    <ul className="divide-y">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <span className="block h-3.5 w-2/3 animate-pulse rounded bg-muted" />
            <span className="block h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Centered empty/error state. */
function EmptyState({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      {action}
    </div>
  );
}
