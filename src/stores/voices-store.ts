import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { mapVoiceRow } from '@/features/voices/utils/voice-mapper';
import type { Voice, VoiceRow } from '@/types/voice';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'VoicesStore');

export interface VoicePatch {
  name?: string;
  description?: string | null;
  tags?: string | null;
}

interface VoicesStore {
  voices: Voice[];
  isLoading: boolean;
  error: string | null;

  fetchVoices: () => Promise<void>;
  updateVoice: (id: string, patch: VoicePatch) => Promise<Voice | null>;
  deleteVoice: (id: string) => Promise<boolean>;
  upsertLocal: (voice: Voice) => void;
}

export const useVoicesStore = create<VoicesStore>()(
  devtools(
    (set, get) => ({
      voices: [],
      isLoading: false,
      error: null,

      fetchVoices: async () => {
        log.info('fetchVoices', 'start');
        set({ isLoading: true, error: null });

        const { data, error } = await supabase
          .from('voices')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          log.error('fetchVoices', 'failed', { error });
          set({ isLoading: false, error: 'Không thể tải danh sách voices' });
          return;
        }

        const voices = ((data ?? []) as VoiceRow[]).map(mapVoiceRow);
        log.info('fetchVoices', 'done', { count: voices.length });
        set({ voices, isLoading: false });
      },

      updateVoice: async (id, patch) => {
        log.info('updateVoice', 'start', { id, fields: Object.keys(patch) });

        const dbPatch: Record<string, unknown> = {};
        if (patch.name !== undefined) dbPatch.name = patch.name;
        if (patch.description !== undefined) dbPatch.description = patch.description;
        if (patch.tags !== undefined) dbPatch.tags = patch.tags;

        const { data, error } = await supabase
          .from('voices')
          .update(dbPatch)
          .eq('id', id)
          .select('*')
          .single();

        if (error || !data) {
          log.error('updateVoice', 'failed', { id, error });
          return null;
        }

        const updated = mapVoiceRow(data as VoiceRow);
        set((state) => ({
          voices: state.voices.map((v) => (v.id === id ? updated : v)),
        }));
        log.info('updateVoice', 'done', { id });
        return updated;
      },

      deleteVoice: async (id) => {
        log.info('deleteVoice', 'start', { id });
        const { error } = await supabase.from('voices').delete().eq('id', id);

        if (error) {
          log.error('deleteVoice', 'failed', { id, error });
          return false;
        }

        set((state) => ({
          voices: state.voices.filter((v) => v.id !== id),
        }));
        log.info('deleteVoice', 'done', { id });
        return true;
      },

      upsertLocal: (voice) => {
        const existing = get().voices.some((v) => v.id === voice.id);
        set((state) => ({
          voices: existing
            ? state.voices.map((v) => (v.id === voice.id ? voice : v))
            : [voice, ...state.voices],
        }));
      },
    }),
    { name: 'voices-store' }
  )
);

export const useVoices = () => useVoicesStore((s) => s.voices);
export const useVoicesLoading = () => useVoicesStore((s) => s.isLoading);
export const useVoicesError = () => useVoicesStore((s) => s.error);

export const useVoicesActions = () =>
  useVoicesStore(
    useShallow((s) => ({
      fetchVoices: s.fetchVoices,
      updateVoice: s.updateVoice,
      deleteVoice: s.deleteVoice,
      upsertLocal: s.upsertLocal,
    }))
  );
