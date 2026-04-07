// genre-store.ts - Zustand store for genres lookup + book_genre junction CRUD.
// Genres are many-to-many with books via the book_genre junction table.
// Supports is_primary: one genre can be marked as primary per book.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { MultiLangName } from '@/types/editor';

const log = createLogger('Store', 'GenreStore');

export interface Genre {
  id: string;
  name: MultiLangName;
  description: string | null;
}

export interface BookGenre {
  id: string;       // junction row id
  genre_id: string;
  is_primary: boolean;
}

interface GenreStore {
  genres: Genre[];
  selectedGenres: BookGenre[];
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;

  fetchGenres: () => Promise<void>;
  fetchBookGenres: (bookId: string) => Promise<void>;
  updateBookGenres: (bookId: string, genres: { genre_id: string; is_primary: boolean }[]) => Promise<boolean>;
  setPrimaryGenre: (bookId: string, genreId: string) => Promise<boolean>;
}

export const useGenreStore = create<GenreStore>()((set, get) => ({
  genres: [],
  selectedGenres: [],
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
    set({ genres: (data ?? []) as Genre[], isLoading: false });
  },

  fetchBookGenres: async (bookId) => {
    log.info('fetchBookGenres', 'start', { bookId });

    const { data, error } = await supabase
      .from('book_genre')
      .select('id, genre_id, is_primary')
      .eq('book_id', bookId);

    if (error) {
      log.error('fetchBookGenres', 'failed', { bookId, error });
      return;
    }

    const genres = (data ?? []) as BookGenre[];
    log.info('fetchBookGenres', 'done', { bookId, count: genres.length });
    set({ selectedGenres: genres });
  },

  updateBookGenres: async (bookId, genres) => {
    log.info('updateBookGenres', 'start', { bookId, count: genres.length });
    const previous = get().selectedGenres;

    // Auto-promote: if no primary in list but list is non-empty, first item becomes primary
    let normalized = genres;
    if (genres.length > 0 && !genres.some((g) => g.is_primary)) {
      normalized = genres.map((g, i) => ({ ...g, is_primary: i === 0 }));
      log.debug('updateBookGenres', 'auto-promoted first item to primary');
    }

    // Optimistic update (derive temp BookGenre[] without junction ids)
    const optimistic: BookGenre[] = normalized.map((g) => ({
      id: '',
      genre_id: g.genre_id,
      is_primary: g.is_primary,
    }));
    set({ isUpdating: true, selectedGenres: optimistic });

    const { error: deleteError } = await supabase
      .from('book_genre')
      .delete()
      .eq('book_id', bookId);

    if (deleteError) {
      log.error('updateBookGenres', 'delete failed, rolling back', { bookId, deleteError });
      set({ isUpdating: false, selectedGenres: previous });
      return false;
    }

    if (normalized.length > 0) {
      const rows = normalized.map((g) => ({
        book_id: bookId,
        genre_id: g.genre_id,
        is_primary: g.is_primary,
      }));
      const { error: insertError } = await supabase.from('book_genre').insert(rows);

      if (insertError) {
        log.error('updateBookGenres', 'insert failed, rolling back', { bookId, insertError });
        set({ isUpdating: false, selectedGenres: previous });
        return false;
      }
    }

    log.info('updateBookGenres', 'done', { bookId, count: normalized.length });
    // Re-fetch to get real junction row ids
    await get().fetchBookGenres(bookId);
    set({ isUpdating: false });
    return true;
  },

  setPrimaryGenre: async (bookId, genreId) => {
    log.info('setPrimaryGenre', 'start', { bookId, genreId });
    const current = get().selectedGenres;
    const updated = current.map((g) => ({ genre_id: g.genre_id, is_primary: g.genre_id === genreId }));
    return get().updateBookGenres(bookId, updated);
  },
}));

// Selectors
export const useGenres = () => useGenreStore((s) => s.genres);
export const useSelectedGenres = () => useGenreStore((s) => s.selectedGenres);
// Derived: list of genre IDs (backward compat for components using string[])
// useShallow prevents infinite re-render from new array reference on each selector call
export const useSelectedGenreIds = () =>
  useGenreStore(useShallow((s) => s.selectedGenres.map((g) => g.genre_id)));
export const usePrimaryGenreId = () =>
  useGenreStore((s) => s.selectedGenres.find((g) => g.is_primary)?.genre_id ?? null);
export const useGenresLoading = () => useGenreStore((s) => s.isLoading);
export const useGenreActions = () =>
  useGenreStore(
    useShallow((s) => ({
      fetchGenres: s.fetchGenres,
      fetchBookGenres: s.fetchBookGenres,
      updateBookGenres: s.updateBookGenres,
      setPrimaryGenre: s.setPrimaryGenre,
    }))
  );
