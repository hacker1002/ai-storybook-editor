// asset-category-store.ts - Zustand store for asset_categories reference data from DB.
// Categories are shared across props, characters, stages.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import type { AssetCategory } from '@/types/prop-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'AssetCategoryStore');

interface AssetCategoryStore {
  categories: AssetCategory[];
  isLoading: boolean;
  error: string | null;

  fetchCategories: () => Promise<void>;
}

export const useAssetCategoryStore = create<AssetCategoryStore>()((set, get) => ({
  categories: [],
  isLoading: false,
  error: null,

  fetchCategories: async () => {
    // Skip if already loaded
    if (get().categories.length > 0) {
      log.debug('fetchCategories', 'cache hit', { count: get().categories.length });
      return;
    }

    log.info('fetchCategories', 'start');
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('asset_categories')
      .select('id, name, type, description')
      .order('type')
      .order('name');

    if (error) {
      log.error('fetchCategories', 'failed', { error });
      set({ isLoading: false, error: 'Failed to load asset categories' });
      return;
    }

    log.info('fetchCategories', 'done', { count: data?.length ?? 0 });
    set({ categories: data ?? [], isLoading: false });
  },
}));

// Selectors
export const useAssetCategories = () => useAssetCategoryStore((s) => s.categories);
export const useAssetCategoriesLoading = () => useAssetCategoryStore((s) => s.isLoading);
export const useAssetCategoryActions = () =>
  useAssetCategoryStore(
    useShallow((s) => ({ fetchCategories: s.fetchCategories }))
  );
