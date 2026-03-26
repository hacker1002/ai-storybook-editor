// location-store.ts - Zustand store for locations reference data from DB.
// Locations represent geographical/fictional places used in books and stages.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import type { Location } from '@/types/location-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'LocationStore');

interface LocationStore {
  locations: Location[];
  isLoading: boolean;
  error: string | null;

  fetchLocations: () => Promise<void>;
}

export const useLocationStore = create<LocationStore>()((set, get) => ({
  locations: [],
  isLoading: false,
  error: null,

  fetchLocations: async () => {
    if (get().locations.length > 0) {
      log.debug('fetchLocations', 'cache hit', { count: get().locations.length });
      return;
    }

    log.info('fetchLocations', 'start');
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('locations')
      .select('id, name, description, nation, city, type, image_references')
      .order('name');

    if (error) {
      log.error('fetchLocations', 'failed', { error });
      set({ isLoading: false, error: 'Failed to load locations' });
      return;
    }

    log.info('fetchLocations', 'done', { count: data?.length ?? 0 });
    set({ locations: data ?? [], isLoading: false });
  },
}));

// Selectors
export const useLocations = () => useLocationStore((s) => s.locations);
export const useLocationsLoading = () => useLocationStore((s) => s.isLoading);
export const useLocationActions = () =>
  useLocationStore(
    useShallow((s) => ({ fetchLocations: s.fetchLocations }))
  );
