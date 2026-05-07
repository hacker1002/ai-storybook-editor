// use-audio-media-url.ts — Shared resolver: store-bound id (UUID) → media_url (string).
//
// Replaces the duplicated `use-music-media-url.ts` / `use-sound-media-url.ts`
// hooks. Music and sound share the same `createAudioStore` factory, so the
// resolver logic (selector subscription + lazy fetch trigger + dangling-FK
// warning) is identical aside from the store and a debug label.
//
// Per-domain wrappers in `playable-spread-view/audio/` keep call sites stable.

import { useEffect, useRef } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import { createLogger } from '@/utils/logger';
import type { AudioStoreState } from './create-audio-store';

export type AudioStoreHook = UseBoundStore<StoreApi<AudioStoreState>>;

/**
 * Resolve `id` against the items in `useStore`. Triggers a one-shot fetch when
 * the store is empty (gated by both `isLoading` and a per-hook ref to avoid
 * parallel fetches when multiple consumers mount simultaneously).
 *
 * @param useStore  zustand store hook returned by `createAudioStore`
 * @param id        UUID to resolve, or null to skip
 * @param label     short debug label used in logs (e.g. 'music', 'sound')
 */
export function useAudioMediaUrl(
  useStore: AudioStoreHook,
  id: string | null,
  label: string,
): string | null {
  const log = useRef(createLogger('AudioLibrary', `useAudioMediaUrl(${label})`)).current;

  const mediaUrl = useStore((state) => {
    if (!id) return null;
    return state.items.find((item) => item.id === id)?.mediaUrl ?? null;
  });

  const hasItems = useStore((state) => state.items.length > 0);
  const isLoading = useStore((state) => state.isLoading);
  const fetchItems = useStore((state) => state.fetch);

  const hasTriggeredFetchRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    if (hasItems) return;
    if (isLoading) return;
    if (hasTriggeredFetchRef.current) return;
    hasTriggeredFetchRef.current = true;
    log.debug('fetch', 'no items in store, triggering fetch', { id });
    void fetchItems();
  }, [id, hasItems, isLoading, fetchItems, log]);

  useEffect(() => {
    if (id && hasItems && !mediaUrl) {
      log.warn('resolve', 'dangling_id', { id });
    }
  }, [id, hasItems, mediaUrl, log]);

  return mediaUrl;
}
