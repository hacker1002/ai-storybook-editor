// humans-store.ts — Zustand store for humans list/detail + metadata + profile array mutations.
// Mirror voices-store pattern; adds immer for JSONB array immutable splice.

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import {
  removeHumanStorageFolder,
} from '@/apis/human-api';
import {
  mapHumanRow,
  toVisualProfileRow,
  toVoiceProfileRow,
} from '@/features/humans/utils/human-mapper';
import type {
  Human,
  HumanMetadataPatch,
  HumanRow,
  VisualProfile,
  VoiceProfile,
} from '@/types/human';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'HumansStore');

interface HumansStore {
  humans: Human[];
  isLoading: boolean;
  error: string | null;

  fetchHumans: () => Promise<void>;
  fetchHumanById: (id: string) => Promise<Human | null>;
  createHuman: (insertPayload: Record<string, unknown>) => Promise<Human | null>;
  updateHumanMetadata: (id: string, patch: HumanMetadataPatch) => Promise<Human | null>;
  deleteHuman: (id: string) => Promise<boolean>;

  addVisualProfile: (id: string, profile: VisualProfile) => Promise<Human | null>;
  updateVisualProfile: (
    id: string,
    index: number,
    patch: Partial<Pick<VisualProfile, 'name' | 'age' | 'type'>>,
  ) => Promise<Human | null>;
  removeVisualProfile: (id: string, index: number) => Promise<Human | null>;

  addVoiceProfile: (id: string, profile: VoiceProfile) => Promise<Human | null>;
  updateVoiceProfile: (
    id: string,
    index: number,
    patch: Partial<Pick<VoiceProfile, 'name' | 'age'>>,
  ) => Promise<Human | null>;
  removeVoiceProfile: (id: string, index: number) => Promise<Human | null>;

  upsertLocal: (human: Human) => void;
}

function metadataPatchToDb(patch: HumanMetadataPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.sourceName !== undefined) out.source_name = patch.sourceName;
  if (patch.displayName !== undefined) out.display_name = patch.displayName;
  if (patch.gender !== undefined) out.gender = patch.gender;
  if (patch.country !== undefined) out.country = patch.country;
  if (patch.description !== undefined) out.description = patch.description;
  return out;
}

export const useHumansStore = create<HumansStore>()(
  devtools(
    immer((set, get) => ({
      humans: [],
      isLoading: false,
      error: null,

      fetchHumans: async () => {
        log.info('fetchHumans', 'start');
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        const { data, error } = await supabase
          .from('humans')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          log.error('fetchHumans', 'failed', { error: error.message });
          set((state) => {
            state.isLoading = false;
            state.error = 'Failed to load humans';
          });
          return;
        }

        const humans = ((data ?? []) as HumanRow[]).map(mapHumanRow);
        log.info('fetchHumans', 'done', { count: humans.length });
        set((state) => {
          state.humans = humans;
          state.isLoading = false;
        });
      },

      fetchHumanById: async (id) => {
        log.info('fetchHumanById', 'start', { id });
        const cached = get().humans.find((h) => h.id === id);
        if (cached) {
          log.debug('fetchHumanById', 'cache hit', { id });
        }

        const { data, error } = await supabase
          .from('humans')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (error) {
          log.error('fetchHumanById', 'failed', { id, error: error.message });
          return cached ?? null;
        }
        if (!data) {
          log.warn('fetchHumanById', 'not found', { id });
          set((state) => {
            state.humans = state.humans.filter((h) => h.id !== id);
          });
          return null;
        }

        const mapped = mapHumanRow(data as HumanRow);
        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx] = mapped;
          else state.humans.unshift(mapped);
        });
        log.info('fetchHumanById', 'done', { id });
        return mapped;
      },

      createHuman: async (insertPayload) => {
        log.info('createHuman', 'start', { fields: Object.keys(insertPayload) });

        const { data, error } = await supabase
          .from('humans')
          .insert(insertPayload)
          .select('*')
          .single();

        if (error || !data) {
          log.error('createHuman', 'failed', { error: error?.message });
          return null;
        }

        const mapped = mapHumanRow(data as HumanRow);
        set((state) => {
          state.humans.unshift(mapped);
        });
        log.info('createHuman', 'done', { id: mapped.id });
        return mapped;
      },

      updateHumanMetadata: async (id, patch) => {
        log.info('updateHumanMetadata', 'start', { id, fields: Object.keys(patch) });

        const prevIdx = get().humans.findIndex((h) => h.id === id);
        if (prevIdx < 0) {
          log.warn('updateHumanMetadata', 'not in cache', { id });
          return null;
        }
        const prev = get().humans[prevIdx];

        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx < 0) return;
          if (patch.sourceName !== undefined) state.humans[idx].sourceName = patch.sourceName;
          if (patch.displayName !== undefined) state.humans[idx].displayName = patch.displayName;
          if (patch.gender !== undefined) state.humans[idx].gender = patch.gender;
          if (patch.country !== undefined) state.humans[idx].country = patch.country;
          if (patch.description !== undefined) state.humans[idx].description = patch.description;
        });

        const dbPatch = metadataPatchToDb(patch);
        const { data, error } = await supabase
          .from('humans')
          .update(dbPatch)
          .eq('id', id)
          .select('*')
          .single();

        if (error || !data) {
          log.error('updateHumanMetadata', 'failed; rolling back', { id, error: error?.message });
          set((state) => {
            const idx = state.humans.findIndex((h) => h.id === id);
            if (idx >= 0) state.humans[idx] = prev;
          });
          return null;
        }

        const mapped = mapHumanRow(data as HumanRow);
        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) {
            state.humans[idx] = {
              ...mapped,
              visualProfiles: state.humans[idx].visualProfiles,
              voiceProfiles: state.humans[idx].voiceProfiles,
            };
          }
        });
        log.info('updateHumanMetadata', 'done', { id });
        return mapped;
      },

      deleteHuman: async (id) => {
        log.info('deleteHuman', 'start', { id });

        const cleaned = await removeHumanStorageFolder(id).catch((err) => {
          log.warn('deleteHuman', 'storage cleanup threw', { id, error: String(err) });
          return false;
        });
        if (!cleaned) {
          log.warn('deleteHuman', 'storage cleanup partial; proceeding with DB delete', { id });
        }

        const { error } = await supabase.from('humans').delete().eq('id', id);
        if (error) {
          log.error('deleteHuman', 'DB delete failed', { id, error: error.message });
          return false;
        }

        set((state) => {
          state.humans = state.humans.filter((h) => h.id !== id);
        });
        log.info('deleteHuman', 'done', { id });
        return true;
      },

      addVisualProfile: async (id, profile) => {
        log.info('addVisualProfile', 'start', { id, name: profile.name });

        const prevIdx = get().humans.findIndex((h) => h.id === id);
        if (prevIdx < 0) {
          log.warn('addVisualProfile', 'not in cache', { id });
          return null;
        }
        const prev = get().humans[prevIdx];
        const next = [...prev.visualProfiles, profile];

        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx].visualProfiles = next;
        });

        const payload = next.map(toVisualProfileRow);
        const { data, error } = await supabase
          .from('humans')
          .update({ visual_profiles: payload })
          .eq('id', id)
          .select('*')
          .single();

        if (error || !data) {
          log.error('addVisualProfile', 'failed; rolling back', { id, error: error?.message });
          set((state) => {
            const idx = state.humans.findIndex((h) => h.id === id);
            if (idx >= 0) state.humans[idx] = prev;
          });
          throw error ?? new Error('Failed to add visual profile');
        }

        const mapped = mapHumanRow(data as HumanRow);
        // Drift correction: keep clientIds for existing profiles; new last entry gets profile.clientId.
        const merged: VisualProfile[] = mapped.visualProfiles.map((p, i) => ({
          ...p,
          clientId: i < prev.visualProfiles.length
            ? prev.visualProfiles[i].clientId
            : i === prev.visualProfiles.length
              ? profile.clientId
              : p.clientId,
        }));
        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) {
            state.humans[idx] = { ...mapped, visualProfiles: merged, voiceProfiles: state.humans[idx].voiceProfiles };
          }
        });
        log.info('addVisualProfile', 'done', { id, count: merged.length });
        return { ...mapped, visualProfiles: merged };
      },

      updateVisualProfile: async (id, index, patch) => {
        log.info('updateVisualProfile', 'start', { id, index, fields: Object.keys(patch) });

        const prevIdx = get().humans.findIndex((h) => h.id === id);
        if (prevIdx < 0) {
          log.warn('updateVisualProfile', 'not in cache', { id });
          return null;
        }
        const prev = get().humans[prevIdx];
        if (index < 0 || index >= prev.visualProfiles.length) {
          log.warn('updateVisualProfile', 'index out of range', { id, index });
          return null;
        }
        const next = prev.visualProfiles.map((p, i) => (i === index ? { ...p, ...patch } : p));

        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx].visualProfiles = next;
        });

        const payload = next.map(toVisualProfileRow);
        const { data, error } = await supabase
          .from('humans')
          .update({ visual_profiles: payload })
          .eq('id', id)
          .select('*')
          .single();

        if (error || !data) {
          log.error('updateVisualProfile', 'failed; rolling back', { id, error: error?.message });
          set((state) => {
            const idx = state.humans.findIndex((h) => h.id === id);
            if (idx >= 0) state.humans[idx] = prev;
          });
          return null;
        }

        const mapped = mapHumanRow(data as HumanRow);
        const merged: VisualProfile[] = mapped.visualProfiles.map((p, i) => ({
          ...p,
          clientId: prev.visualProfiles[i]?.clientId ?? p.clientId,
        }));
        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx] = { ...mapped, visualProfiles: merged, voiceProfiles: state.humans[idx].voiceProfiles };
        });
        log.info('updateVisualProfile', 'done', { id, index });
        return { ...mapped, visualProfiles: merged };
      },

      removeVisualProfile: async (id, index) => {
        log.info('removeVisualProfile', 'start', { id, index });

        const prevIdx = get().humans.findIndex((h) => h.id === id);
        if (prevIdx < 0) return null;
        const prev = get().humans[prevIdx];
        if (index < 0 || index >= prev.visualProfiles.length) return null;
        const next = prev.visualProfiles.filter((_, i) => i !== index);

        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx].visualProfiles = next;
        });

        const payload = next.map(toVisualProfileRow);
        const { data, error } = await supabase
          .from('humans')
          .update({ visual_profiles: payload })
          .eq('id', id)
          .select('*')
          .single();

        if (error || !data) {
          log.error('removeVisualProfile', 'failed; rolling back', { id, error: error?.message });
          set((state) => {
            const idx = state.humans.findIndex((h) => h.id === id);
            if (idx >= 0) state.humans[idx] = prev;
          });
          return null;
        }

        const mapped = mapHumanRow(data as HumanRow);
        // Drift: rebuild clientIds aligned with surviving profiles (filter prev[index] removed).
        const survivingClientIds = prev.visualProfiles.filter((_, i) => i !== index).map((p) => p.clientId);
        const merged: VisualProfile[] = mapped.visualProfiles.map((p, i) => ({
          ...p,
          clientId: survivingClientIds[i] ?? p.clientId,
        }));
        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx] = { ...mapped, visualProfiles: merged, voiceProfiles: state.humans[idx].voiceProfiles };
        });
        log.info('removeVisualProfile', 'done', { id, index });
        return { ...mapped, visualProfiles: merged };
      },

      addVoiceProfile: async (id, profile) => {
        log.info('addVoiceProfile', 'start', { id, name: profile.name });

        const prevIdx = get().humans.findIndex((h) => h.id === id);
        if (prevIdx < 0) {
          log.warn('addVoiceProfile', 'not in cache', { id });
          return null;
        }
        const prev = get().humans[prevIdx];
        const next = [...prev.voiceProfiles, profile];

        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx].voiceProfiles = next;
        });

        const payload = next.map(toVoiceProfileRow);
        const { data, error } = await supabase
          .from('humans')
          .update({ voice_profiles: payload })
          .eq('id', id)
          .select('*')
          .single();

        if (error || !data) {
          log.error('addVoiceProfile', 'failed; rolling back', { id, error: error?.message });
          set((state) => {
            const idx = state.humans.findIndex((h) => h.id === id);
            if (idx >= 0) state.humans[idx] = prev;
          });
          throw error ?? new Error('Failed to add voice profile');
        }

        const mapped = mapHumanRow(data as HumanRow);
        const merged: VoiceProfile[] = mapped.voiceProfiles.map((p, i) => ({
          ...p,
          clientId: i < prev.voiceProfiles.length
            ? prev.voiceProfiles[i].clientId
            : i === prev.voiceProfiles.length
              ? profile.clientId
              : p.clientId,
        }));
        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx] = { ...mapped, voiceProfiles: merged, visualProfiles: state.humans[idx].visualProfiles };
        });
        log.info('addVoiceProfile', 'done', { id, count: merged.length });
        return { ...mapped, voiceProfiles: merged };
      },

      updateVoiceProfile: async (id, index, patch) => {
        log.info('updateVoiceProfile', 'start', { id, index, fields: Object.keys(patch) });

        const prevIdx = get().humans.findIndex((h) => h.id === id);
        if (prevIdx < 0) return null;
        const prev = get().humans[prevIdx];
        if (index < 0 || index >= prev.voiceProfiles.length) return null;
        const next = prev.voiceProfiles.map((p, i) => (i === index ? { ...p, ...patch } : p));

        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx].voiceProfiles = next;
        });

        const payload = next.map(toVoiceProfileRow);
        const { data, error } = await supabase
          .from('humans')
          .update({ voice_profiles: payload })
          .eq('id', id)
          .select('*')
          .single();

        if (error || !data) {
          log.error('updateVoiceProfile', 'failed; rolling back', { id, error: error?.message });
          set((state) => {
            const idx = state.humans.findIndex((h) => h.id === id);
            if (idx >= 0) state.humans[idx] = prev;
          });
          return null;
        }

        const mapped = mapHumanRow(data as HumanRow);
        const merged: VoiceProfile[] = mapped.voiceProfiles.map((p, i) => ({
          ...p,
          clientId: prev.voiceProfiles[i]?.clientId ?? p.clientId,
        }));
        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx] = { ...mapped, voiceProfiles: merged, visualProfiles: state.humans[idx].visualProfiles };
        });
        log.info('updateVoiceProfile', 'done', { id, index });
        return { ...mapped, voiceProfiles: merged };
      },

      removeVoiceProfile: async (id, index) => {
        log.info('removeVoiceProfile', 'start', { id, index });

        const prevIdx = get().humans.findIndex((h) => h.id === id);
        if (prevIdx < 0) return null;
        const prev = get().humans[prevIdx];
        if (index < 0 || index >= prev.voiceProfiles.length) return null;
        const next = prev.voiceProfiles.filter((_, i) => i !== index);

        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx].voiceProfiles = next;
        });

        const payload = next.map(toVoiceProfileRow);
        const { data, error } = await supabase
          .from('humans')
          .update({ voice_profiles: payload })
          .eq('id', id)
          .select('*')
          .single();

        if (error || !data) {
          log.error('removeVoiceProfile', 'failed; rolling back', { id, error: error?.message });
          set((state) => {
            const idx = state.humans.findIndex((h) => h.id === id);
            if (idx >= 0) state.humans[idx] = prev;
          });
          return null;
        }

        const mapped = mapHumanRow(data as HumanRow);
        const survivingClientIds = prev.voiceProfiles.filter((_, i) => i !== index).map((p) => p.clientId);
        const merged: VoiceProfile[] = mapped.voiceProfiles.map((p, i) => ({
          ...p,
          clientId: survivingClientIds[i] ?? p.clientId,
        }));
        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === id);
          if (idx >= 0) state.humans[idx] = { ...mapped, voiceProfiles: merged, visualProfiles: state.humans[idx].visualProfiles };
        });
        log.info('removeVoiceProfile', 'done', { id, index });
        return { ...mapped, voiceProfiles: merged };
      },

      upsertLocal: (human) => {
        set((state) => {
          const idx = state.humans.findIndex((h) => h.id === human.id);
          if (idx >= 0) state.humans[idx] = human;
          else state.humans.unshift(human);
        });
      },
    })),
    { name: 'humans-store' },
  ),
);

export const useHumans = () => useHumansStore((s) => s.humans);
export const useHumansLoading = () => useHumansStore((s) => s.isLoading);
export const useHumansError = () => useHumansStore((s) => s.error);
export const useHumanById = (id: string | undefined) =>
  useHumansStore((s) => (id ? s.humans.find((h) => h.id === id) : undefined));

export const useHumansActions = () =>
  useHumansStore(
    useShallow((s) => ({
      fetchHumans: s.fetchHumans,
      fetchHumanById: s.fetchHumanById,
      createHuman: s.createHuman,
      updateHumanMetadata: s.updateHumanMetadata,
      deleteHuman: s.deleteHuman,
      addVisualProfile: s.addVisualProfile,
      updateVisualProfile: s.updateVisualProfile,
      removeVisualProfile: s.removeVisualProfile,
      addVoiceProfile: s.addVoiceProfile,
      updateVoiceProfile: s.updateVoiceProfile,
      removeVoiceProfile: s.removeVoiceProfile,
      upsertLocal: s.upsertLocal,
    })),
  );
