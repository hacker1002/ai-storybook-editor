// use-activity-logs — per-collaborator activity-log query for the log tab.
//
// Direct Supabase (RLS SELECT = owner + collaborator of the book), no store. Scope is
// always ONE actor: `WHERE book_id = ? AND actor_user_id = ?`. Type + time filters are
// pushed DOWN to the query (indexes `(book_id,created_at)`, `(book_id,action_type)`);
// pagination is CURSOR-based on `created_at` (LIMIT 50) — never offset — so new rows
// arriving between pages cannot shift a window and skip/duplicate rows.
//
// The initial load + every filter change runs an async data-fetch effect (mirrors
// use-collaborators.loadAll). That is the canonical fetch pattern — an async setState
// in an effect — NOT a synchronous self-heal, so it does not trip the React-19
// set-state-in-effect lint. `loadMore` is imperative (driven by an IntersectionObserver
// in the tab), reading the cursor from the last loaded row.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import { timeRangeSince, type ActivityLog, type TimeRange } from '../activity-log-consts';

const log = createLogger('Editor', 'useActivityLogs');

const PAGE_SIZE = 50;

interface UseActivityLogsParams {
  bookId: string;
  actorUserId: string;
  typeFilter: number[]; // action_type values; [] = all types
  timeFilter: TimeRange;
  sortDesc: boolean; // true = newest first (default)
}

interface UseActivityLogsReturn {
  logs: ActivityLog[];
  isLoading: boolean; // first page / filter-change reload
  isLoadingMore: boolean; // subsequent cursor pages
  hasMore: boolean;
  error: string | null;
  loadMore: () => void;
}

export function useActivityLogs({
  bookId,
  actorUserId,
  typeFilter,
  timeFilter,
  sortDesc,
}: UseActivityLogsParams): UseActivityLogsReturn {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable primitive proxy for the array dep so a fresh `[]` each render does not
  // refire the query (the callers hold typeFilter in useState, but this is belt-and-suspenders).
  const typeFilterKey = typeFilter.join(',');

  // Time-window floor captured ONCE per filter session (memo on timeFilter) so the
  // lower bound does not drift forward between load-more pages (rows near the exact
  // boundary would otherwise fall out on later pages).
  const since = useMemo(() => timeRangeSince(timeFilter), [timeFilter]);

  // Build the filtered/sorted/cursor-bounded query. `cursor` = created_at of the last
  // loaded row. The cursor is INCLUSIVE (lte/gte): audit rows written in one transaction
  // share an identical created_at (Postgres now() is the txn timestamp), so a STRICT
  // cursor would SKIP every tied row past the 50-row boundary. Inclusive + the id-dedupe
  // on append re-admits the tied rows while dropping the re-fetched boundary row; the
  // secondary `id` sort makes the within-timestamp order deterministic across pages.
  const buildQuery = useCallback(
    (cursor: string | null) => {
      let q = supabase
        .from('collaboration_activity_logs')
        .select('*')
        .eq('book_id', bookId)
        .eq('actor_user_id', actorUserId);

      const types = typeFilterKey ? typeFilterKey.split(',').map(Number) : [];
      if (types.length > 0) q = q.in('action_type', types);
      if (since) q = q.gte('created_at', since);

      q = q.order('created_at', { ascending: !sortDesc }).order('id', { ascending: !sortDesc });
      if (cursor) q = sortDesc ? q.lte('created_at', cursor) : q.gte('created_at', cursor);

      return q.limit(PAGE_SIZE);
    },
    [bookId, actorUserId, typeFilterKey, since, sortDesc],
  );

  // First page + filter-change reload. ALL setState lives inside the nested async
  // function (never the effect's direct body) — the canonical data-fetch pattern
  // (mirrors use-collaborators.loadAll), which the React-19 set-state-in-effect lint
  // permits (it flags only synchronous set-state in the effect body). The cancelled
  // flag guards the tail so a stale response (filter/actor changed mid-flight) never
  // overwrites a fresher load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!bookId || !actorUserId) {
        log.debug('load', 'no book/actor, clearing', { hasBook: !!bookId, hasActor: !!actorUserId });
        if (!cancelled) {
          setLogs([]);
          setIsLoading(false);
          setHasMore(false);
        }
        return;
      }
      setIsLoading(true);
      log.info('load', 'loading first page of activity logs');
      const { data, error: qErr } = await buildQuery(null);
      if (cancelled) {
        log.debug('load', 'stale load discarded');
        return;
      }
      if (qErr) {
        log.error('load', 'query failed', { error: qErr.message });
        setError(qErr.message);
        setLogs([]);
        setHasMore(false);
      } else {
        const rows = (data as ActivityLog[]) ?? [];
        log.debug('load', 'first page loaded', { count: rows.length });
        setError(null);
        setLogs(rows);
        setHasMore(rows.length === PAGE_SIZE);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, actorUserId, buildQuery]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore || logs.length === 0) {
      log.debug('loadMore', 'skip', { isLoadingMore, hasMore, have: logs.length });
      return;
    }
    const cursor = logs[logs.length - 1].created_at;
    setIsLoadingMore(true);
    void (async () => {
      log.debug('loadMore', 'loading next page', { have: logs.length });
      const { data, error: qErr } = await buildQuery(cursor);
      if (qErr) {
        log.error('loadMore', 'query failed', { error: qErr.message });
        setError(qErr.message);
        setIsLoadingMore(false);
        return;
      }
      const rows = (data as ActivityLog[]) ?? [];
      // Inclusive cursor re-fetches the boundary rows → drop already-seen ids. Stop when a
      // full page produced NO new rows (all were boundary re-fetches) so we never loop.
      const seen = new Set(logs.map((r) => r.id));
      const fresh = rows.filter((r) => !seen.has(r.id));
      log.debug('loadMore', 'next page loaded', { fetched: rows.length, fresh: fresh.length });
      setLogs((prev) => (fresh.length > 0 ? [...prev, ...fresh] : prev));
      setHasMore(fresh.length > 0 && rows.length === PAGE_SIZE);
      setError(null); // recovered from any prior paging error
      setIsLoadingMore(false);
    })();
  }, [isLoadingMore, hasMore, logs, buildQuery]);

  return { logs, isLoading, isLoadingMore, hasMore, error, loadMore };
}
