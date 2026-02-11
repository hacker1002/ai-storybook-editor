import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { devtools } from 'zustand/middleware';

// Book settings for Brief attributes (UI state during editing)
// Using numbers to match database schema
export interface BookSettings {
  targetAudience: number | null;
  targetCoreValue: number | null;
  formatGenre: number | null;
  contentGenre: number | null;
}

// Book references (optional attributes)
export interface BookReferences {
  eraId: string | null;
  locationId: string | null;
}

interface EditorBookSettingsStore {
  settings: BookSettings;
  references: BookReferences;
  updateSettings: (updates: Partial<BookSettings>) => void;
  updateReferences: (updates: Partial<BookReferences>) => void;
  resetBookSettings: () => void;
}

const DEFAULT_SETTINGS: BookSettings = {
  targetAudience: null,
  targetCoreValue: null,
  formatGenre: null,
  contentGenre: null,
};

const DEFAULT_REFERENCES: BookReferences = {
  eraId: null,
  locationId: null,
};

export const useEditorBookSettingsStore = create<EditorBookSettingsStore>()(
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

      resetBookSettings: () =>
        set({
          settings: DEFAULT_SETTINGS,
          references: DEFAULT_REFERENCES,
        }),
    }),
    { name: 'editor-book-settings-store' }
  )
);

// Selectors
export const useBookSettings = () => useEditorBookSettingsStore((s) => s.settings);
export const useBookReferences = () => useEditorBookSettingsStore((s) => s.references);
export const useBookActions = () =>
  useEditorBookSettingsStore(
    useShallow((s) => ({
      updateSettings: s.updateSettings,
      updateReferences: s.updateReferences,
      resetBookSettings: s.resetBookSettings,
    }))
  );
