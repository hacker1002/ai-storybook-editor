// Sounds store — thin wrapper over the shared `createAudioStore` factory so
// the public hooks (`useSounds`, `useSoundsActions`, ...) keep their existing
// shape and call sites don't need to change.

import { useShallow } from 'zustand/react/shallow';
import {
  buildAudioStoreHooks,
  createAudioStore,
  type AudioPatch,
} from '@/features/audio-library';
import type { Sound } from '@/types/sound';

export type SoundPatch = AudioPatch;

export const useSoundsStore = createAudioStore({
  tableName: 'sounds',
  storeName: 'sounds-store',
});

const baseHooks = buildAudioStoreHooks(useSoundsStore);

export const useSounds = baseHooks.useItems;
export const useSoundsLoading = baseHooks.useLoading;
export const useSoundsError = baseHooks.useError;

/**
 * Backward-compatible action shape. Adds `removeLocal` for callers that
 * delete out-of-band (via shared `deleteAudioRowAndCleanup`) and need to
 * sync local state.
 */
// IMPORTANT: pass store methods through by reference. Wrapping in arrows
// breaks `useShallow` (new fn identity per render) and triggers an infinite
// loop via `useEffect([fetchSounds])` consumers. `AudioPatch === SoundPatch`
// and `AudioResource === Sound` (type aliases) so the legacy signatures hold.
export const useSoundsActions = () =>
  useSoundsStore(
    useShallow((s) => ({
      fetchSounds: s.fetch,
      updateSound: s.update as (id: string, patch: SoundPatch) => Promise<Sound | null>,
      deleteSound: s.remove,
      upsertLocal: s.upsertLocal as (sound: Sound) => void,
      removeLocal: s.removeLocal,
    })),
  );
