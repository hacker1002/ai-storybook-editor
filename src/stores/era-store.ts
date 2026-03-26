// era-store.ts - Zustand store for eras reference data from DB.
// Eras represent historical/fictional time periods used in books and stages.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import type { Era } from '@/types/era-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'EraStore');

interface EraStore {
  eras: Era[];
  isLoading: boolean;
  error: string | null;

  fetchEras: () => Promise<void>;
}

export const useEraStore = create<EraStore>()((set, get) => ({
  eras: [],
  isLoading: false,
  error: null,

  fetchEras: async () => {
    if (get().eras.length > 0) {
      log.debug('fetchEras', 'cache hit', { count: get().eras.length });
      return;
    }

    log.info('fetchEras', 'start');
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('eras')
      .select('id, name, description, image_references')
      .order('name');

    if (error) {
      log.error('fetchEras', 'failed', { error });
      set({ isLoading: false, error: 'Failed to load eras' });
      return;
    }

    log.info('fetchEras', 'done', { count: data?.length ?? 0 });
    set({ eras: data ?? [], isLoading: false });
  },
}));

// Selectors
export const useEras = () => useEraStore((s) => s.eras);
export const useErasLoading = () => useEraStore((s) => s.isLoading);
export const useEraActions = () =>
  useEraStore(
    useShallow((s) => ({ fetchEras: s.fetchEras }))
  );
