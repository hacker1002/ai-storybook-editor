import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { persist, devtools } from 'zustand/middleware';
import { supabase } from '@/apis/supabase';
import type { Book, BookListItem } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'BookStore');

interface BookStore {
  books: BookListItem[];
  currentBook: Book | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  fetchBooks: () => Promise<void>;
  fetchBook: (bookId: string) => Promise<Book | null>;
  updateBook: (bookId: string, updates: Partial<Book>) => Promise<boolean>;
  deleteBook: (bookId: string) => Promise<boolean>;
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

          if (lastFetchedAt && Date.now() - lastFetchedAt < CACHE_DURATION && books.length > 0) {
            log.debug('fetchBooks', 'cache hit', { bookCount: books.length });
            return;
          }

          log.info('fetchBooks', 'start');
          set({ isLoading: true, error: null });

          const { data, error } = await supabase
            .from('books')
            .select('id, title, description, cover, owner_id, step, type, created_at, updated_at')
            .order('updated_at', { ascending: false });

          if (error) {
            log.error('fetchBooks', 'failed', { error });
            set({ isLoading: false, error: 'Không thể tải danh sách sách' });
            return;
          }

          log.info('fetchBooks', 'done', { bookCount: data?.length ?? 0 });
          set({
            books: data || [],
            isLoading: false,
            lastFetchedAt: Date.now(),
          });
        },

        fetchBook: async (bookId) => {
          log.info('fetchBook', 'start', { bookId });
          set({ isLoading: true, error: null });

          const { data, error } = await supabase
            .from('books')
            .select('*')
            .eq('id', bookId)
            .single();

          if (error) {
            log.error('fetchBook', 'failed', { bookId, error });
            set({ isLoading: false, error: 'Không thể tải sách' });
            return null;
          }

          log.info('fetchBook', 'done', { bookId });
          set({ currentBook: data, isLoading: false });
          return data;
        },

        updateBook: async (bookId, updates) => {
          log.info('updateBook', 'start', { bookId, updateKeys: Object.keys(updates) });
          const previousBook = get().currentBook;
          const previousBooks = get().books;

          // Optimistic update
          set((state) => ({
            currentBook: state.currentBook?.id === bookId
              ? { ...state.currentBook, ...updates }
              : state.currentBook,
            books: state.books.map((b) =>
              b.id === bookId ? { ...b, ...updates } : b
            ),
            lastFetchedAt: null,
          }));

          const { error } = await supabase
            .from('books')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', bookId);

          if (error) {
            log.error('updateBook', 'failed, rolling back', { bookId, error });
            // Rollback on error
            set({ currentBook: previousBook, books: previousBooks });
            return false;
          }

          log.info('updateBook', 'done', { bookId });
          return true;
        },

        deleteBook: async (bookId) => {
          log.info('deleteBook', 'start', { bookId });
          const previousBooks = get().books;

          // Optimistic update
          set((state) => ({
            books: state.books.filter((b) => b.id !== bookId),
            currentBook: state.currentBook?.id === bookId ? null : state.currentBook,
          }));

          const { error } = await supabase
            .from('books')
            .delete()
            .eq('id', bookId);

          if (error) {
            log.error('deleteBook', 'failed, rolling back', { bookId, error });
            // Rollback on error
            set({ books: previousBooks });
            return false;
          }

          log.info('deleteBook', 'done', { bookId });
          return true;
        },

        setCurrentBook: (book) => {
          const prev = get().currentBook?.id ?? null;
          const next = book?.id ?? null;
          log.info('setCurrentBook', 'transition', { prev, next });
          set({ currentBook: book });
        },

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

// State selectors
export const useBooks = () => useBookStore((s) => s.books);
export const useCurrentBook = () => useBookStore((s) => s.currentBook);
export const useBooksLoading = () => useBookStore((s) => s.isLoading);
export const useBooksError = () => useBookStore((s) => s.error);

// Computed selectors
export const useBookTitle = () => useBookStore((s) => s.currentBook?.title ?? null);
export const useBookStep = () => useBookStore((s) => s.currentBook?.step ?? null);
export const useIsSourceBook = () => useBookStore((s) => s.currentBook?.type === 0);

// Actions hook (stable reference, no re-render)
export const useBookActions = () =>
  useBookStore(
    useShallow((s) => ({
      fetchBooks: s.fetchBooks,
      fetchBook: s.fetchBook,
      updateBook: s.updateBook,
      deleteBook: s.deleteBook,
      setCurrentBook: s.setCurrentBook,
      clearBooks: s.clearBooks,
    }))
  );
