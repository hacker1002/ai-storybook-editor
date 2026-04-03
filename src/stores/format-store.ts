// format-store.ts - Zustand store for formats reference data (readonly lookup).
// Formats define the book type/structure (e.g. Narrative Picture Books).

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'FormatStore');

export interface Format {
  id: string;
  name: string;
  description: string | null;
}

interface FormatStore {
  formats: Format[];
  isLoading: boolean;
  error: string | null;

  fetchFormats: () => Promise<void>;
}

export const useFormatStore = create<FormatStore>()((set, get) => ({
  formats: [],
  isLoading: false,
  error: null,

  fetchFormats: async () => {
    if (get().formats.length > 0) {
      log.debug('fetchFormats', 'cache hit', { count: get().formats.length });
      return;
    }

    log.info('fetchFormats', 'start');
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('formats')
      .select('id, name, description')
      .order('name');

    if (error) {
      log.error('fetchFormats', 'failed', { error });
      set({ isLoading: false, error: 'Failed to load formats' });
      return;
    }

    log.info('fetchFormats', 'done', { count: data?.length ?? 0 });
    set({ formats: data ?? [], isLoading: false });
  },
}));

// Selectors
export const useFormats = () => useFormatStore((s) => s.formats);
export const useFormatsLoading = () => useFormatStore((s) => s.isLoading);
export const useFormatActions = () =>
  useFormatStore(useShallow((s) => ({ fetchFormats: s.fetchFormats })));
