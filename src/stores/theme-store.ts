// theme-store.ts - Zustand store for themes lookup + book_theme junction CRUD.
// Themes are many-to-many with books via the book_theme junction table.
// Supports is_primary: one theme can be marked as primary per book.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { MultiLangName } from '@/types/editor';

const log = createLogger('Store', 'ThemeStore');

export interface Theme {
  id: string;
  name: MultiLangName;
  description: string | null;
}

export interface BookTheme {
  id: string;       // junction row id
  theme_id: string;
  is_primary: boolean;
}

interface ThemeStore {
  themes: Theme[];
  selectedThemes: BookTheme[];
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;

  fetchThemes: () => Promise<void>;
  fetchBookThemes: (bookId: string) => Promise<void>;
  updateBookThemes: (bookId: string, themes: { theme_id: string; is_primary: boolean }[]) => Promise<boolean>;
  setPrimaryTheme: (bookId: string, themeId: string) => Promise<boolean>;
}

export const useThemeStore = create<ThemeStore>()((set, get) => ({
  themes: [],
  selectedThemes: [],
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
    set({ themes: (data ?? []) as Theme[], isLoading: false });
  },

  fetchBookThemes: async (bookId) => {
    log.info('fetchBookThemes', 'start', { bookId });

    const { data, error } = await supabase
      .from('book_theme')
      .select('id, theme_id, is_primary')
      .eq('book_id', bookId);

    if (error) {
      log.error('fetchBookThemes', 'failed', { bookId, error });
      return;
    }

    const themes = (data ?? []) as BookTheme[];
    log.info('fetchBookThemes', 'done', { bookId, count: themes.length });
    set({ selectedThemes: themes });
  },

  updateBookThemes: async (bookId, themes) => {
    log.info('updateBookThemes', 'start', { bookId, count: themes.length });
    const previous = get().selectedThemes;

    // Auto-promote: if no primary in list but list is non-empty, first item becomes primary
    let normalized = themes;
    if (themes.length > 0 && !themes.some((t) => t.is_primary)) {
      normalized = themes.map((t, i) => ({ ...t, is_primary: i === 0 }));
      log.debug('updateBookThemes', 'auto-promoted first item to primary');
    }

    // Optimistic update (derive temp BookTheme[] without junction ids)
    const optimistic: BookTheme[] = normalized.map((t) => ({
      id: '',
      theme_id: t.theme_id,
      is_primary: t.is_primary,
    }));
    set({ isUpdating: true, selectedThemes: optimistic });

    // Delete all → insert selected
    const { error: deleteError } = await supabase
      .from('book_theme')
      .delete()
      .eq('book_id', bookId);

    if (deleteError) {
      log.error('updateBookThemes', 'delete failed, rolling back', { bookId, deleteError });
      set({ isUpdating: false, selectedThemes: previous });
      return false;
    }

    if (normalized.length > 0) {
      const rows = normalized.map((t) => ({
        book_id: bookId,
        theme_id: t.theme_id,
        is_primary: t.is_primary,
      }));
      const { error: insertError } = await supabase.from('book_theme').insert(rows);

      if (insertError) {
        log.error('updateBookThemes', 'insert failed, rolling back', { bookId, insertError });
        set({ isUpdating: false, selectedThemes: previous });
        return false;
      }
    }

    log.info('updateBookThemes', 'done', { bookId, count: normalized.length });
    // Re-fetch to get real junction row ids
    await get().fetchBookThemes(bookId);
    set({ isUpdating: false });
    return true;
  },

  setPrimaryTheme: async (bookId, themeId) => {
    log.info('setPrimaryTheme', 'start', { bookId, themeId });
    const current = get().selectedThemes;
    const updated = current.map((t) => ({ theme_id: t.theme_id, is_primary: t.theme_id === themeId }));
    return get().updateBookThemes(bookId, updated);
  },
}));

// Selectors
export const useThemes = () => useThemeStore((s) => s.themes);
export const useSelectedThemes = () => useThemeStore((s) => s.selectedThemes);
// Derived: list of theme IDs (backward compat for components using string[])
// useShallow prevents infinite re-render from new array reference on each selector call
export const useSelectedThemeIds = () =>
  useThemeStore(useShallow((s) => s.selectedThemes.map((t) => t.theme_id)));
export const usePrimaryThemeId = () =>
  useThemeStore((s) => s.selectedThemes.find((t) => t.is_primary)?.theme_id ?? null);
export const useThemesLoading = () => useThemeStore((s) => s.isLoading);
export const useThemeActions = () =>
  useThemeStore(
    useShallow((s) => ({
      fetchThemes: s.fetchThemes,
      fetchBookThemes: s.fetchBookThemes,
      updateBookThemes: s.updateBookThemes,
      setPrimaryTheme: s.setPrimaryTheme,
    }))
  );
