import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { persist, devtools } from "zustand/middleware";
import { supabase } from "@/apis/supabase";
import type {
  Book,
  BookListItem,
  BookMusicSettings,
  BookSoundSettings,
  BookEffectsSettings,
  BranchTypographySettings,
  NarratorSettings,
  NarratorInferenceParams,
  NarratorLanguageEntry,
} from "@/types/editor";
import {
  DEFAULT_BRANCH_TYPOGRAPHY,
  DEFAULT_INFERENCE_PARAMS,
  NARRATOR_LANGUAGE_KEY_REGEX,
  VOLUME_DEFAULT,
} from "@/constants/config-constants";
import { createLogger } from "@/utils/logger";

const log = createLogger("Store", "BookStore");

export interface CreateBookParams {
  title: string;
  format_id: string;
  dimension: number;
  target_audience: number;
  artstyle_id: string;
  original_language: string;
}

interface BookStore {
  books: BookListItem[];
  currentBook: Book | null;
  isLoading: boolean;
  error: string | null;
  lastFetchedAt: number | null;

  fetchBooks: () => Promise<void>;
  fetchBook: (bookId: string) => Promise<Book | null>;
  createBook: (params: CreateBookParams) => Promise<Book | null>;
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

          if (
            lastFetchedAt &&
            Date.now() - lastFetchedAt < CACHE_DURATION &&
            books.length > 0
          ) {
            log.debug("fetchBooks", "cache hit", { bookCount: books.length });
            return;
          }

          log.info("fetchBooks", "start");
          set({ isLoading: true, error: null });

          const { data, error } = await supabase
            .from("books")
            .select(
              "id, title, description, cover, owner_id, step, type, created_at, updated_at"
            )
            .order("updated_at", { ascending: false });

          if (error) {
            log.error("fetchBooks", "failed", { error });
            set({ isLoading: false, error: "Không thể tải danh sách sách" });
            return;
          }

          log.info("fetchBooks", "done", { bookCount: data?.length ?? 0 });
          set({
            books: data || [],
            isLoading: false,
            lastFetchedAt: Date.now(),
          });
        },

        fetchBook: async (bookId) => {
          log.info("fetchBook", "start", { bookId });
          set({ isLoading: true, error: null });

          const { data, error } = await supabase
            .from("books")
            .select("*")
            .eq("id", bookId)
            .single();

          if (error) {
            log.error("fetchBook", "failed", { bookId, error });
            set({ isLoading: false, error: "Không thể tải sách" });
            return null;
          }

          log.info("fetchBook", "done", { bookId });
          set({ currentBook: data, isLoading: false });
          return data;
        },

        createBook: async (params) => {
          log.info("createBook", "start", { title: params.title });
          set({ isLoading: true, error: null });

          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            log.error("createBook", "no authenticated user");
            set({
              isLoading: false,
              error: "Vui lòng đăng nhập để tạo truyện",
            });
            return null;
          }

          const { data: bookData, error: bookError } = await supabase
            .from("books")
            .insert({
              title: params.title,
              owner_id: user.id,
              format_id: params.format_id,
              book_type: 1,
              dimension: params.dimension,
              target_audience: params.target_audience,
              artstyle_id: params.artstyle_id,
              step: 1,
              type: 1,
              original_language: params.original_language,
            })
            .select("*")
            .single();

          if (bookError || !bookData) {
            log.error("createBook", "book insert failed", { error: bookError });
            set({ isLoading: false, error: "Không thể tạo truyện mới" });
            return null;
          }

          const now = new Date();
          const version = `${now.getFullYear()}${String(
            now.getMonth() + 1
          ).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(
            now.getHours()
          ).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

          const { error: snapshotError } = await supabase
            .from("snapshots")
            .insert({
              book_id: bookData.id,
              version,
              save_type: 1,
            });

          if (snapshotError) {
            log.warn(
              "createBook",
              "snapshot insert failed, book still created",
              { bookId: bookData.id, error: snapshotError }
            );
          }

          log.info("createBook", "done", { bookId: bookData.id });
          set((state) => ({
            books: [
              {
                id: bookData.id,
                title: bookData.title,
                description: bookData.description,
                cover: bookData.cover,
                owner_id: bookData.owner_id,
                step: bookData.step,
                type: bookData.type,
                created_at: bookData.created_at,
                updated_at: bookData.updated_at,
              },
              ...state.books,
            ],
            currentBook: bookData,
            isLoading: false,
            lastFetchedAt: null,
          }));

          return bookData;
        },

        updateBook: async (bookId, updates) => {
          log.info("updateBook", "start", {
            bookId,
            updateKeys: Object.keys(updates),
          });
          const previousBook = get().currentBook;
          const previousBooks = get().books;

          // Optimistic update
          set((state) => ({
            currentBook:
              state.currentBook?.id === bookId
                ? { ...state.currentBook, ...updates }
                : state.currentBook,
            books: state.books.map((b) =>
              b.id === bookId ? { ...b, ...updates } : b
            ),
            lastFetchedAt: null,
          }));

          const { error } = await supabase
            .from("books")
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq("id", bookId);

          if (error) {
            log.error("updateBook", "failed, rolling back", { bookId, error });
            // Rollback on error
            set({ currentBook: previousBook, books: previousBooks });
            return false;
          }

          log.info("updateBook", "done", { bookId });
          return true;
        },

        deleteBook: async (bookId) => {
          log.info("deleteBook", "start", { bookId });
          const previousBooks = get().books;

          // Optimistic update
          set((state) => ({
            books: state.books.filter((b) => b.id !== bookId),
            currentBook:
              state.currentBook?.id === bookId ? null : state.currentBook,
          }));

          const { error } = await supabase
            .from("books")
            .delete()
            .eq("id", bookId);

          if (error) {
            log.error("deleteBook", "failed, rolling back", { bookId, error });
            // Rollback on error
            set({ books: previousBooks });
            return false;
          }

          log.info("deleteBook", "done", { bookId });
          return true;
        },

        setCurrentBook: (book) => {
          const prev = get().currentBook?.id ?? null;
          const next = book?.id ?? null;
          log.info("setCurrentBook", "transition", { prev, next });
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
        name: "book-store",
        partialize: (state) => ({
          books: state.books,
          lastFetchedAt: state.lastFetchedAt,
        }),
      }
    ),
    { name: "book-store" }
  )
);

// State selectors
export const useBooks = () => useBookStore((s) => s.books);
export const useCurrentBook = () => useBookStore((s) => s.currentBook);
export const useBooksLoading = () => useBookStore((s) => s.isLoading);
export const useBooksError = () => useBookStore((s) => s.error);

// Computed selectors
export const useBookTitle = () =>
  useBookStore((s) => s.currentBook?.title ?? null);
export const useBookStep = () =>
  useBookStore((s) => s.currentBook?.step ?? null);
export const useIsSourceBook = () =>
  useBookStore((s) => s.currentBook?.type === 0);
export const useBookShape = () =>
  useBookStore((s) => s.currentBook?.shape ?? null);
export const useBookTypography = () =>
  useBookStore((s) => s.currentBook?.typography ?? null);
export const useBookBranch = () =>
  useBookStore((s) => s.currentBook?.branch ?? null);
export const useBookBranchTypography = (languageCode: string): BranchTypographySettings =>
  useBookStore((s) => {
    const book = s.currentBook;
    const branch = book?.branch;
    return (
      branch?.typography?.[languageCode] ??
      branch?.typography?.[book?.original_language ?? ''] ??
      DEFAULT_BRANCH_TYPOGRAPHY
    );
  });
export const useBookTemplateLayout = () =>
  useBookStore((s) => s.currentBook?.template_layout ?? null);

// ── Music & Sound selectors ──────────────────────────────────────────────────

export const useBookMusic = (): BookMusicSettings | null =>
  useBookStore((s) => s.currentBook?.music ?? null);

export const useBookSound = (): BookSoundSettings | null =>
  useBookStore((s) => s.currentBook?.sound ?? null);

// ── Effects selector ─────────────────────────────────────────────────────────

export const useBookEffects = (): BookEffectsSettings | null =>
  useBookStore((s) => s.currentBook?.effects ?? null);

/**
 * Narrator volume scale (0..2). Falls back to VOLUME_DEFAULT (1.0) when unset.
 */
export const useBookNarratorVolume = (): number =>
  useBookStore((s) => {
    const n = s.currentBook?.narrator;
    const v = n?.volume_scale;
    if (typeof v === "number") return v;
    log.debug("useBookNarratorVolume", "fallback default", {
      hasNarrator: !!n,
    });
    return VOLUME_DEFAULT;
  });

// ── Narrator selectors ──────────────────────────────────────────────────────

export const useBookNarrator = (): NarratorSettings | null =>
  useBookStore((s) => s.currentBook?.narrator ?? null);

/**
 * Pull the 5 inference params from narrator (fallback to defaults when null).
 * Components can diff against DEFAULT_INFERENCE_PARAMS to show "modified" state.
 */
export const useNarratorInferenceParams = (): NarratorInferenceParams =>
  useBookStore((s) => {
    const n = s.currentBook?.narrator;
    if (!n) {
      log.debug("useNarratorInferenceParams", "narrator null, returning defaults");
      return DEFAULT_INFERENCE_PARAMS;
    }
    return {
      speed: typeof n.speed === "number" ? n.speed : DEFAULT_INFERENCE_PARAMS.speed,
      stability:
        typeof n.stability === "number" ? n.stability : DEFAULT_INFERENCE_PARAMS.stability,
      similarity:
        typeof n.similarity === "number" ? n.similarity : DEFAULT_INFERENCE_PARAMS.similarity,
      exaggeration:
        typeof n.exaggeration === "number"
          ? n.exaggeration
          : DEFAULT_INFERENCE_PARAMS.exaggeration,
      speaker_boost:
        typeof n.speaker_boost === "boolean"
          ? n.speaker_boost
          : DEFAULT_INFERENCE_PARAMS.speaker_boost,
    };
  });

/**
 * Read the narrator entry for a specific language code (returns null when unset).
 * Guards key via NARRATOR_LANGUAGE_KEY_REGEX so a literal setting key (e.g. "model")
 * can never be misread as a language entry.
 */
export const useNarratorLanguageEntry = (
  code: string,
): NarratorLanguageEntry | null =>
  useBookStore((s) => {
    if (!NARRATOR_LANGUAGE_KEY_REGEX.test(code)) {
      log.warn("useNarratorLanguageEntry", "invalid language code", { code });
      return null;
    }
    const n = s.currentBook?.narrator;
    const entry = n?.[code];
    if (!entry || typeof entry !== "object") return null;
    return entry as NarratorLanguageEntry;
  });

// Actions hook (stable reference, no re-render)
export const useBookActions = () =>
  useBookStore(
    useShallow((s) => ({
      fetchBooks: s.fetchBooks,
      fetchBook: s.fetchBook,
      createBook: s.createBook,
      updateBook: s.updateBook,
      deleteBook: s.deleteBook,
      setCurrentBook: s.setCurrentBook,
      clearBooks: s.clearBooks,
    }))
  );
