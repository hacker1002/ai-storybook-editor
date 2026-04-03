// theme-store.ts - Zustand store for themes lookup + book_theme junction CRUD.
// Themes are many-to-many with books via the book_theme junction table.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'ThemeStore');

export interface Theme {
  id: string;
  name: string;
  description: string | null;
}

interface ThemeStore {
  themes: Theme[];
  selectedThemeIds: string[];
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;

  fetchThemes: () => Promise<void>;
  fetchBookThemes: (bookId: string) => Promise<void>;
  updateBookThemes: (bookId: string, themeIds: string[]) => Promise<boolean>;
}

export const useThemeStore = create<ThemeStore>()((set, get) => ({
  themes: [],
  selectedThemeIds: [],
  isLoading: false,
  isUpdating: false,
  error: null,

  fetchThemes: async () => {
    if (get().themes.length > 0) {
      log.debug('fetchThemes', 'cache hit', { count: get().themes.length });
      return;
    }

    log.info('fetchThemes', 'start');
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('themes')
      .select('id, name, description')
      .order('name');

    if (error) {
      log.error('fetchThemes', 'failed', { error });
      set({ isLoading: false, error: 'Failed to load themes' });
      return;
    }

    log.info('fetchThemes', 'done', { count: data?.length ?? 0 });
    set({ themes: data ?? [], isLoading: false });
  },

  fetchBookThemes: async (bookId) => {
    log.info('fetchBookThemes', 'start', { bookId });

    const { data, error } = await supabase
      .from('book_theme')
      .select('theme_id')
      .eq('book_id', bookId);

    if (error) {
      log.error('fetchBookThemes', 'failed', { bookId, error });
      return;
    }

    const ids = (data ?? []).map((row) => row.theme_id);
    log.info('fetchBookThemes', 'done', { bookId, count: ids.length });
    set({ selectedThemeIds: ids });
  },

  updateBookThemes: async (bookId, themeIds) => {
    log.info('updateBookThemes', 'start', { bookId, count: themeIds.length });
    const previous = get().selectedThemeIds;

    // Optimistic update
    set({ isUpdating: true, selectedThemeIds: themeIds });

    // Delete all → insert selected (atomic via sequential ops; RLS protects rows)
    const { error: deleteError } = await supabase
      .from('book_theme')
      .delete()
      .eq('book_id', bookId);

    if (deleteError) {
      log.error('updateBookThemes', 'delete failed, rolling back', { bookId, deleteError });
      set({ isUpdating: false, selectedThemeIds: previous });
      return false;
    }

    if (themeIds.length > 0) {
      const rows = themeIds.map((theme_id) => ({ book_id: bookId, theme_id }));
      const { error: insertError } = await supabase.from('book_theme').insert(rows);

      if (insertError) {
        log.error('updateBookThemes', 'insert failed, rolling back', { bookId, insertError });
        set({ isUpdating: false, selectedThemeIds: previous });
        return false;
      }
    }

    log.info('updateBookThemes', 'done', { bookId, count: themeIds.length });
    set({ isUpdating: false });
    return true;
  },
}));

// Selectors
export const useThemes = () => useThemeStore((s) => s.themes);
export const useSelectedThemeIds = () => useThemeStore((s) => s.selectedThemeIds);
export const useThemesLoading = () => useThemeStore((s) => s.isLoading);
export const useThemeActions = () =>
  useThemeStore(
    useShallow((s) => ({
      fetchThemes: s.fetchThemes,
      fetchBookThemes: s.fetchBookThemes,
      updateBookThemes: s.updateBookThemes,
    }))
  );
