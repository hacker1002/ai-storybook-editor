// genre-store.ts - Zustand store for genres lookup + book_genre junction CRUD.
// Genres are many-to-many with books via the book_genre junction table.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'GenreStore');

export interface Genre {
  id: string;
  name: string;
  description: string | null;
}

interface GenreStore {
  genres: Genre[];
  selectedGenreIds: string[];
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;

  fetchGenres: () => Promise<void>;
  fetchBookGenres: (bookId: string) => Promise<void>;
  updateBookGenres: (bookId: string, genreIds: string[]) => Promise<boolean>;
}

export const useGenreStore = create<GenreStore>()((set, get) => ({
  genres: [],
  selectedGenreIds: [],
  isLoading: false,
  isUpdating: false,
  error: null,

  fetchGenres: async () => {
    if (get().genres.length > 0) {
      log.debug('fetchGenres', 'cache hit', { count: get().genres.length });
      return;
    }

    log.info('fetchGenres', 'start');
    set({ isLoading: true, error: null });

    const { data, error } = await supabase
      .from('genres')
      .select('id, name, description')
      .order('name');

    if (error) {
      log.error('fetchGenres', 'failed', { error });
      set({ isLoading: false, error: 'Failed to load genres' });
      return;
    }

    log.info('fetchGenres', 'done', { count: data?.length ?? 0 });
    set({ genres: data ?? [], isLoading: false });
  },

  fetchBookGenres: async (bookId) => {
    log.info('fetchBookGenres', 'start', { bookId });

    const { data, error } = await supabase
      .from('book_genre')
      .select('genre_id')
      .eq('book_id', bookId);

    if (error) {
      log.error('fetchBookGenres', 'failed', { bookId, error });
      return;
    }

    const ids = (data ?? []).map((row) => row.genre_id);
    log.info('fetchBookGenres', 'done', { bookId, count: ids.length });
    set({ selectedGenreIds: ids });
  },

  updateBookGenres: async (bookId, genreIds) => {
    log.info('updateBookGenres', 'start', { bookId, count: genreIds.length });
    const previous = get().selectedGenreIds;

    // Optimistic update
    set({ isUpdating: true, selectedGenreIds: genreIds });

    const { error: deleteError } = await supabase
      .from('book_genre')
      .delete()
      .eq('book_id', bookId);

    if (deleteError) {
      log.error('updateBookGenres', 'delete failed, rolling back', { bookId, deleteError });
      set({ isUpdating: false, selectedGenreIds: previous });
      return false;
    }

    if (genreIds.length > 0) {
      const rows = genreIds.map((genre_id) => ({ book_id: bookId, genre_id }));
      const { error: insertError } = await supabase.from('book_genre').insert(rows);

      if (insertError) {
        log.error('updateBookGenres', 'insert failed, rolling back', { bookId, insertError });
        set({ isUpdating: false, selectedGenreIds: previous });
        return false;
      }
    }

    log.info('updateBookGenres', 'done', { bookId, count: genreIds.length });
    set({ isUpdating: false });
    return true;
  },
}));

// Selectors
export const useGenres = () => useGenreStore((s) => s.genres);
export const useSelectedGenreIds = () => useGenreStore((s) => s.selectedGenreIds);
export const useGenresLoading = () => useGenreStore((s) => s.isLoading);
export const useGenreActions = () =>
  useGenreStore(
    useShallow((s) => ({
      fetchGenres: s.fetchGenres,
      fetchBookGenres: s.fetchBookGenres,
      updateBookGenres: s.updateBookGenres,
    }))
  );
