// art-style-store.ts - Zustand store for art style description fetched from DB.
// Used by all illustration API calls to pass artStyleDescription.

import { create } from 'zustand';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'ArtStyleStore');

interface ArtStyleStore {
  name: string | null;
  description: string | null;
  isLoading: boolean;
  error: string | null;

  fetchArtStyle: (artStyleId: string) => Promise<void>;
  reset: () => void;
}

export const useArtStyleStore = create<ArtStyleStore>()((set, get) => ({
  name: null,
  description: null,
  isLoading: false,
  error: null,

  fetchArtStyle: async (artStyleId: string) => {
    if (get().description !== null) {
      log.debug('fetchArtStyle', 'cache hit');
      return;
    }

    log.info('fetchArtStyle', 'start', { artStyleId });
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('art_styles')
      .select('name, description')
      .eq('id', artStyleId)
      .single();

    if (error) {
      log.error('fetchArtStyle', 'failed', { error });
      set({ isLoading: false, error: 'Failed to load art style' });
      return;
    }

    log.info('fetchArtStyle', 'done', { hasDescription: !!data?.description });
    set({ name: data?.name ?? null, description: data?.description ?? null, isLoading: false });
  },

  reset: () => set({ name: null, description: null, isLoading: false, error: null }),
}));

// Selectors
export const useArtStyleName = () => useArtStyleStore((s) => s.name);
export const useArtStyleDescription = () => useArtStyleStore((s) => s.description);
