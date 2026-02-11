import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import type { Book, BookListItem } from '@/types/editor';

interface BookStore {
  books: BookListItem[];
  currentBook: Book | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  fetchBooks: () => Promise<void>;
  fetchBook: (bookId: string) => Promise<Book | null>;
  setCurrentBook: (book: Book | null) => void;
  clearBooks: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const useBookStore = create<BookStore>()(
  devtools(
    persist(
      (set, get) => ({
        books: [],
        currentBook: null,
        isLoading: false,
        error: null,
        lastFetchedAt: null,

        fetchBooks: async () => {
          const { lastFetchedAt, books } = get();

          // Skip if cache fresh
          if (lastFetchedAt && Date.now() - lastFetchedAt < CACHE_DURATION && books.length > 0) {
            return;
          }

          set({ isLoading: true, error: null });

          const { data, error } = await supabase
            .from('books')
            .select('id, title, description, cover, step, type, updated_at')
            .order('updated_at', { ascending: false });

          if (error) {
            set({ isLoading: false, error: 'Không thể tải danh sách sách' });
            return;
          }

          set({
            books: data || [],
            isLoading: false,
            lastFetchedAt: Date.now(),
          });
        },

        fetchBook: async (bookId) => {
          set({ isLoading: true, error: null });

          const { data, error } = await supabase
            .from('books')
            .select('*')
            .eq('id', bookId)
            .single();

          if (error) {
            set({ isLoading: false, error: 'Không thể tải sách' });
            return null;
          }

          set({ currentBook: data, isLoading: false });
          return data;
        },

        setCurrentBook: (book) => set({ currentBook: book }),

        clearBooks: () =>
          set({
            books: [],
            currentBook: null,
            lastFetchedAt: null,
            error: null,
          }),
      }),
      {
        name: 'book-store',
        partialize: (state) => ({
          books: state.books,
          lastFetchedAt: state.lastFetchedAt,
        }),
      }
    ),
    { name: 'book-store' }
  )
);

// Selectors
export const useBooks = () => useBookStore((s) => s.books);
export const useCurrentBook = () => useBookStore((s) => s.currentBook);
export const useBooksLoading = () => useBookStore((s) => s.isLoading);
export const useBooksError = () => useBookStore((s) => s.error);
