// Zustand store factory parameterized by table name. Mirrors the legacy
// SoundsStore shape so existing call sites (`useSounds`, `useSoundsActions`,
// `useSoundsLoading`, `useSoundsError`) re-export from a per-domain wrapper
// without behavior change.

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import { mapAudioRow } from '../utils/audio-mapper';
import type { AudioResource, AudioRow, AudioTableName } from '../types';

export interface AudioPatch {
  name?: string;
  description?: string | null;
  tags?: string | null;
}

export interface AudioStoreState {
  items: AudioResource[];
  isLoading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  update: (id: string, patch: AudioPatch) => Promise<AudioResource | null>;
  remove: (id: string) => Promise<boolean>;
  upsertLocal: (item: AudioResource) => void;
  removeLocal: (id: string) => void;
}

export interface CreateAudioStoreOptions {
  tableName: AudioTableName;
  storeName: string;
}

export function createAudioStore({
  tableName,
  storeName,
}: CreateAudioStoreOptions): UseBoundStore<StoreApi<AudioStoreState>> {
  const log = createLogger('Store', storeName);

  return create<AudioStoreState>()(
    devtools(
      (set, get) => ({
        items: [],
        isLoading: false,
        error: null,

        fetch: async () => {
          log.info('fetch', 'start', { tableName });
          set({ isLoading: true, error: null });

          const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .order('created_at', { ascending: false });

          if (error) {
            log.error('fetch', 'failed', { tableName, code: error.code });
            set({ isLoading: false, error: 'Failed to load items' });
            return;
          }

          const items = ((data ?? []) as AudioRow[]).map(mapAudioRow);
          log.info('fetch', 'done', { count: items.length });
          set({ items, isLoading: false });
        },

        update: async (id, patch) => {
          log.info('update', 'start', { id, fields: Object.keys(patch) });

          const dbPatch: Record<string, unknown> = {};
          if (patch.name !== undefined) dbPatch.name = patch.name;
          if (patch.description !== undefined) dbPatch.description = patch.description;
          if (patch.tags !== undefined) dbPatch.tags = patch.tags;

          const { data, error } = await supabase
            .from(tableName)
            .update(dbPatch)
            .eq('id', id)
            .select('*')
            .single();

          if (error || !data) {
            log.warn('update', 'failed', { id, code: error?.code });
            return null;
          }

          const updated = mapAudioRow(data as AudioRow);
          set((state) => ({
            items: state.items.map((s) => (s.id === id ? updated : s)),
          }));
          log.info('update', 'done', { id });
          return updated;
        },

        remove: async (id) => {
          log.info('remove', 'start', { id });
          const { error } = await supabase.from(tableName).delete().eq('id', id);

          if (error) {
            log.error('remove', 'failed', { id, code: error.code });
            return false;
          }

          set((state) => ({ items: state.items.filter((s) => s.id !== id) }));
          log.info('remove', 'done', { id });
          return true;
        },

        upsertLocal: (item) => {
          const existing = get().items.some((s) => s.id === item.id);
          log.debug('upsertLocal', existing ? 'replace' : 'prepend', { id: item.id });
          set((state) => ({
            items: existing
              ? state.items.map((s) => (s.id === item.id ? item : s))
              : [item, ...state.items],
          }));
        },

        removeLocal: (id) => {
          log.debug('removeLocal', 'remove', { id });
          set((state) => ({ items: state.items.filter((s) => s.id !== id) }));
        },
      }),
      { name: storeName },
    ),
  );
}

/**
 * Build the four idiomatic selector hooks (`useItems`, `useLoading`, `useError`,
 * `useActions`) from a store created via `createAudioStore`.
 */
export function buildAudioStoreHooks<S extends UseBoundStore<StoreApi<AudioStoreState>>>(
  useStore: S,
) {
  const useItems = () => useStore((s) => s.items);
  const useLoading = () => useStore((s) => s.isLoading);
  const useError = () => useStore((s) => s.error);
  const useActions = () =>
    useStore(
      useShallow((s) => ({
        fetch: s.fetch,
        update: s.update,
        remove: s.remove,
        upsertLocal: s.upsertLocal,
        removeLocal: s.removeLocal,
      })),
    );
  return { useItems, useLoading, useError, useActions };
}
