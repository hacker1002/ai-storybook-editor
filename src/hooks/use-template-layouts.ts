// use-template-layouts.ts — Shared hook to fetch and cache template_layouts from Supabase

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { TemplateLayout } from '@/types/editor';

const log = createLogger('Hooks', 'useTemplateLayouts');

interface UseTemplateLayoutsResult {
  spreadLayouts: TemplateLayout[];
  singlePageLayouts: TemplateLayout[];
  allLayouts: TemplateLayout[];
  isLoading: boolean;
}

const EMPTY: TemplateLayout[] = [];

export function useTemplateLayouts(bookType: number | null): UseTemplateLayoutsResult {
  const [allLayouts, setAllLayouts] = useState<TemplateLayout[]>(EMPTY);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (bookType === null) return;

    let cancelled = false;

    const fetchLayouts = async () => {
      setIsLoading(true);
      log.info('fetchLayouts', 'start', { bookType });

      const { data, error } = await supabase
        .from('template_layouts')
        .select('id, title, thumbnail_url, type, book_type, textboxes, images')
        .eq('book_type', bookType)
        .order('title', { ascending: true });

      if (cancelled) return;

      if (error) {
        log.error('fetchLayouts', 'failed', { error });
        setIsLoading(false);
        return;
      }

      setAllLayouts((data ?? []) as TemplateLayout[]);
      log.info('fetchLayouts', 'done', { total: data?.length ?? 0 });
      setIsLoading(false);
    };

    void fetchLayouts();

    return () => {
      cancelled = true;
    };
  }, [bookType]);

  const spreadLayouts = useMemo(() => allLayouts.filter((l) => l.type === 1), [allLayouts]);
  const singlePageLayouts = useMemo(() => allLayouts.filter((l) => l.type === 2), [allLayouts]);

  return { spreadLayouts, singlePageLayouts, allLayouts, isLoading };
}
