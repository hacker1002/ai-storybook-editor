import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { devtools } from 'zustand/middleware';
import type { BookSettings, BookReferences } from '@/types/editor';

interface BookStore {
  settings: BookSettings;
  references: BookReferences;
  updateSettings: (updates: Partial<BookSettings>) => void;
  updateReferences: (updates: Partial<BookReferences>) => void;
  resetBook: () => void;
}

const DEFAULT_SETTINGS: BookSettings = {
  targetAudience: '',
  targetCoreValue: '',
  formatGenre: '',
  contentGenre: '',
};

const DEFAULT_REFERENCES: BookReferences = {
  eraId: null,
  locationId: null,
};

export const useBookStore = create<BookStore>()(
  devtools(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      references: DEFAULT_REFERENCES,

      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),

      updateReferences: (updates) =>
        set((state) => ({
          references: { ...state.references, ...updates },
        })),

      resetBook: () =>
        set({
          settings: DEFAULT_SETTINGS,
          references: DEFAULT_REFERENCES,
        }),
    }),
    { name: 'book-store' }
  )
);

// Selectors
export const useBookSettings = () => useBookStore((s) => s.settings);
export const useBookReferences = () => useBookStore((s) => s.references);
export const useBookActions = () =>
  useBookStore(
    useShallow((s) => ({
      updateSettings: s.updateSettings,
      updateReferences: s.updateReferences,
      resetBook: s.resetBook,
    }))
  );
