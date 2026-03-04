import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
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

        updateBook: async (bookId, updates) => {
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
            console.error('[book-store] updateBook error:', error);
            // Rollback on error
            set({ currentBook: previousBook, books: previousBooks });
            return false;
          }

          return true;
        },

        deleteBook: async (bookId) => {
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
            console.error('[book-store] deleteBook error:', error);
            // Rollback on error
            set({ books: previousBooks });
            return false;
          }

          return true;
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
