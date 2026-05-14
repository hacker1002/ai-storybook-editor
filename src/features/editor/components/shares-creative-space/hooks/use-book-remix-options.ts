import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { RemixOption } from '../share-link-types';
import { ORIGINAL_REMIX_OPTION } from '../share-link-types';

const log = createLogger('Editor', 'useBookRemixOptions');

interface UseBookRemixOptionsReturn {
  remixOptions: RemixOption[];
  isLoading: boolean;
}

// Fetch all remixes whose underlying snapshot belongs to `bookId`, then prepend the
// Original sentinel. Cross-snapshot scope on purpose: a share link may point to a remix
// of any snapshot of the book, not just current_version.
export function useBookRemixOptions(bookId: string): UseBookRemixOptionsReturn {
  const [remixOptions, setRemixOptions] = useState<RemixOption[]>([ORIGINAL_REMIX_OPTION]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRemixOptions = useCallback(async () => {
    log.info('fetchRemixOptions', 'fetching remix options for book', { bookId });
    setIsLoading(true);
    try {
      // Nested filter: only remixes whose snapshot.book_id matches.
      // `!inner` makes the join a filter (not a left-join), so unmatched rows drop out.
      const { data, error } = await supabase
        .from('remixes')
        .select('id, name, snapshot:snapshots!inner(book_id)')
        .eq('snapshot.book_id', bookId)
        .order('created_at', { ascending: true });

      if (error) {
        log.error('fetchRemixOptions', 'fetch failed', { error: error.message, bookId });
        setRemixOptions([ORIGINAL_REMIX_OPTION]);
        return;
      }

      const rows = (data ?? []) as Array<{ id: string; name: string | null }>;
      const options: RemixOption[] = [
        ORIGINAL_REMIX_OPTION,
        ...rows.map((r) => ({ id: r.id, name: r.name ?? 'Untitled Remix' })),
      ];
      log.debug('fetchRemixOptions', 'fetched', { count: rows.length });
      setRemixOptions(options);
    } finally {
      setIsLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    if (!bookId) {
      setRemixOptions([ORIGINAL_REMIX_OPTION]);
      return;
    }
    fetchRemixOptions();
  }, [bookId, fetchRemixOptions]);

  return { remixOptions, isLoading };
}
