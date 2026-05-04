// Musics store — wraps shared `createAudioStore` factory.

import { useShallow } from 'zustand/react/shallow';
import {
  buildAudioStoreHooks,
  createAudioStore,
  type AudioPatch,
} from '@/features/audio-library';
import type { Music } from '@/types/music';

export type MusicPatch = AudioPatch;

export const useMusicsStore = createAudioStore({
  tableName: 'musics',
  storeName: 'musics-store',
});

const baseHooks = buildAudioStoreHooks(useMusicsStore);

export const useMusics = baseHooks.useItems;
export const useMusicsLoading = baseHooks.useLoading;
export const useMusicsError = baseHooks.useError;

// IMPORTANT: pass store methods through by reference. Wrapping in arrows
// breaks `useShallow` (new fn identity per render) and triggers an infinite
// loop via `useEffect([fetchMusics])` consumers.
export const useMusicsActions = () =>
  useMusicsStore(
    useShallow((s) => ({
      fetchMusics: s.fetch,
      updateMusic: s.update as (id: string, patch: MusicPatch) => Promise<Music | null>,
      deleteMusic: s.remove,
      upsertLocal: s.upsertLocal as (music: Music) => void,
      removeLocal: s.removeLocal,
    })),
  );
