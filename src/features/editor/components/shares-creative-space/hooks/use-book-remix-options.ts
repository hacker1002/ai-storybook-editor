import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { RemixConfig, RemixLanguageChoice } from '@/types/remix';
import type { RemixOption, ShareLanguage } from '../share-link-types';
import { LANGUAGE_OPTIONS, ORIGINAL_REMIX_OPTION } from '../share-link-types';

const log = createLogger('Editor', 'useBookRemixOptions');

interface UseBookRemixOptionsReturn {
  remixOptions: RemixOption[];
  isLoading: boolean;
}

// Intersect a remix's enabled languages with LANGUAGE_OPTIONS (share-link universe).
// Order follows LANGUAGE_OPTIONS so the modal renders a stable, predictable list.
function deriveAvailableLanguages(remixConfig: RemixConfig | null): ShareLanguage[] {
  if (!remixConfig?.languages?.length) return [...LANGUAGE_OPTIONS];
  const enabledCodes = new Set(
    remixConfig.languages
      .filter((l: RemixLanguageChoice) => l.is_enabled)
      .map((l) => l.code),
  );
  return LANGUAGE_OPTIONS.filter((opt) => enabledCodes.has(opt.code));
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
      const { data, error } = await supabase
        .from('remixes')
        .select('id, name, remix_config, snapshot:snapshots!inner(book_id)')
        .eq('snapshot.book_id', bookId)
        .order('created_at', { ascending: true });

      if (error) {
        log.error('fetchRemixOptions', 'fetch failed', { error: error.message, bookId });
        setRemixOptions([ORIGINAL_REMIX_OPTION]);
        return;
      }

      const rows = (data ?? []) as Array<{
        id: string;
        name: string | null;
        remix_config: RemixConfig | null;
      }>;
      const options: RemixOption[] = [
        ORIGINAL_REMIX_OPTION,
        ...rows.map((r) => ({
          id: r.id,
          name: r.name ?? 'Untitled Remix',
          available_languages: deriveAvailableLanguages(r.remix_config),
        })),
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
