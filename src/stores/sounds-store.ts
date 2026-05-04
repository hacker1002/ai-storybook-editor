import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { mapSoundRow } from '@/features/sounds/utils/sound-mapper';
import type { Sound, SoundRow } from '@/types/sound';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'SoundsStore');

export interface SoundPatch {
  name?: string;
  description?: string | null;
  tags?: string | null;
}

interface SoundsStore {
  sounds: Sound[];
  isLoading: boolean;
  error: string | null;

  fetchSounds: () => Promise<void>;
  updateSound: (id: string, patch: SoundPatch) => Promise<Sound | null>;
  deleteSound: (id: string) => Promise<boolean>;
  upsertLocal: (sound: Sound) => void;
}

export const useSoundsStore = create<SoundsStore>()(
  devtools(
    (set, get) => ({
      sounds: [],
      isLoading: false,
      error: null,

      fetchSounds: async () => {
        log.info('fetchSounds', 'start');
        set({ isLoading: true, error: null });

        const { data, error } = await supabase
          .from('sounds')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          log.error('fetchSounds', 'failed', { error });
          set({ isLoading: false, error: 'Không thể tải danh sách sounds' });
          return;
        }

        const sounds = ((data ?? []) as SoundRow[]).map(mapSoundRow);
        log.info('fetchSounds', 'done', { count: sounds.length });
        set({ sounds, isLoading: false });
      },

      updateSound: async (id, patch) => {
        log.info('updateSound', 'start', { id, fields: Object.keys(patch) });

        const dbPatch: Record<string, unknown> = {};
        if (patch.name !== undefined) dbPatch.name = patch.name;
        if (patch.description !== undefined) dbPatch.description = patch.description;
        if (patch.tags !== undefined) dbPatch.tags = patch.tags;

        const { data, error } = await supabase
          .from('sounds')
          .update(dbPatch)
          .eq('id', id)
          .select('*')
          .single();

        if (error || !data) {
          log.warn('updateSound', 'failed', { id, error });
          return null;
        }

        const updated = mapSoundRow(data as SoundRow);
        set((state) => ({
          sounds: state.sounds.map((s) => (s.id === id ? updated : s)),
        }));
        log.info('updateSound', 'done', { id });
        return updated;
      },

      deleteSound: async (id) => {
        log.info('deleteSound', 'start', { id });
        const { error } = await supabase.from('sounds').delete().eq('id', id);

        if (error) {
          log.error('deleteSound', 'failed', { id, error });
          return false;
        }

        set((state) => ({
          sounds: state.sounds.filter((s) => s.id !== id),
        }));
        log.info('deleteSound', 'done', { id });
        return true;
      },

      upsertLocal: (sound) => {
        const existing = get().sounds.some((s) => s.id === sound.id);
        log.debug('upsertLocal', existing ? 'replace' : 'prepend', { id: sound.id });
        set((state) => ({
          sounds: existing
            ? state.sounds.map((s) => (s.id === sound.id ? sound : s))
            : [sound, ...state.sounds],
        }));
      },
    }),
    { name: 'sounds-store' }
  )
);

export const useSounds = () => useSoundsStore((s) => s.sounds);
export const useSoundsLoading = () => useSoundsStore((s) => s.isLoading);
export const useSoundsError = () => useSoundsStore((s) => s.error);

export const useSoundsActions = () =>
  useSoundsStore(
    useShallow((s) => ({
      fetchSounds: s.fetchSounds,
      updateSound: s.updateSound,
      deleteSound: s.deleteSound,
      upsertLocal: s.upsertLocal,
    }))
  );
