// editor-space-view-store.ts - Zustand store for per-space view state persistence (ADR-021)
// Keyed by (bookId, CreativeSpaceType) → each creative space remembers its own view state.

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type { ViewMode } from '@/types/canvas-types';
import type { CreativeSpaceType } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'EditorSpaceViewStore');

// === Types ===

export interface SpaceViewState {
  activeSpreadId?: string | null;
  zoomLevel?: number;
  viewMode?: ViewMode;
  columnsPerRow?: number;
}

interface EditorSpaceViewStore {
  byBook: Record<string, Partial<Record<CreativeSpaceType, SpaceViewState>>>;
  patchSpace: (bookId: string, space: CreativeSpaceType, patch: Partial<SpaceViewState>) => void;
  clearBook: (bookId: string) => void;
}

/** Stable empty reference — must be module-level const, NOT created in component render. */
export const EMPTY_SLOT: Readonly<SpaceViewState> = Object.freeze({});

// === Store ===

export const useEditorSpaceViewStore = create<EditorSpaceViewStore>()(
  devtools(
    persist(
      (set) => ({
        byBook: {},

        patchSpace: (bookId, space, patch) => {
          log.debug('patchSpace', 'patching space view state', { bookId, space, keys: Object.keys(patch) });
          set((state) => ({
            byBook: {
              ...state.byBook,
              [bookId]: {
                ...state.byBook[bookId],
                [space]: {
                  ...state.byBook[bookId]?.[space],
                  ...patch,
                },
              },
            },
          }));
        },

        clearBook: (bookId) => {
          log.info('clearBook', 'clearing all space view state for book', { bookId });
          set((state) => {
            const next = { ...state.byBook };
            delete next[bookId];
            return { byBook: next };
          });
        },
      }),
      {
        name: 'editor-space-view-v1',
        storage: createJSONStorage(() => localStorage),
        version: 1,
        // Stub migrate — version 1 is the first, nothing to migrate from.
        migrate: (state) => state,
        // Only serialize byBook — actions are recreated each store init.
        partialize: (state) => ({ byBook: (state as EditorSpaceViewStore).byBook }),
      }
    ),
    { name: 'editor-space-view-store' }
  )
);

// === Selector ===

/** Returns the view state slot for (bookId, space). Falls back to EMPTY_SLOT (stable ref). */
export function useSpaceViewSlot(
  bookId: string | undefined,
  space: CreativeSpaceType
): Readonly<SpaceViewState> {
  return useEditorSpaceViewStore(
    useShallow((s) => s.byBook[bookId ?? '']?.[space] ?? EMPTY_SLOT)
  );
}
