import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { mapStyleRow } from '@/features/styles/utils/style-mapper';
import type { ArtStyle, ArtStyleRow } from '@/types/art-style';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'ArtStylesStore');

interface ArtStylesStore {
  styles: ArtStyle[];
  isLoading: boolean;
  error: string | null;

  fetchStyles: () => Promise<void>;
  upsertLocal: (style: ArtStyle) => void;
  removeLocal: (id: string) => void;
}

export const useArtStylesStore = create<ArtStylesStore>()(
  devtools(
    (set, get) => ({
      styles: [],
      isLoading: false,
      error: null,

      fetchStyles: async () => {
        log.info('fetchStyles', 'start');
        set({ isLoading: true, error: null });

        const { data, error } = await supabase
          .from('art_styles')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          log.error('fetchStyles', 'failed', { error: error.message });
          set({ isLoading: false, error: 'Không thể tải danh sách art styles' });
          return;
        }

        const styles = ((data ?? []) as ArtStyleRow[]).map(mapStyleRow);
        log.info('fetchStyles', 'done', { count: styles.length });
        set({ styles, isLoading: false });
      },

      upsertLocal: (style) => {
        const existing = get().styles.some((s) => s.id === style.id);
        log.debug('upsertLocal', existing ? 'replace' : 'insert', { id: style.id });
        set((state) => ({
          styles: existing
            ? state.styles.map((s) => (s.id === style.id ? style : s))
            : [style, ...state.styles],
        }));
      },

      removeLocal: (id) => {
        log.debug('removeLocal', 'remove', { id });
        set((state) => ({
          styles: state.styles.filter((s) => s.id !== id),
        }));
      },
    }),
    { name: 'art-styles-store' }
  )
);

export const useArtStyles = () => useArtStylesStore((s) => s.styles);
export const useArtStylesLoading = () => useArtStylesStore((s) => s.isLoading);
export const useArtStylesError = () => useArtStylesStore((s) => s.error);

export const useArtStylesActions = () =>
  useArtStylesStore(
    useShallow((s) => ({
      fetchStyles: s.fetchStyles,
      upsertLocal: s.upsertLocal,
      removeLocal: s.removeLocal,
    }))
  );
