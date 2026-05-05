// use-music-media-url.ts — Resolve book.music.background_id (UUID) → media_url (string).
//
// Design source: ai-storybook-design/component/editor-page/shared/playable-spread-view/03-10-audio-mixer.md §9.3
// Phase plan: plans/260505-1455-player-audio-mixer-frontend-impl/phase-04-use-music-media-url-query.md
//
// Reuses the existing `useMusicsStore` (zustand-based) cache instead of introducing
// dedicated TanStack Query infrastructure (KISS).
//
// Dedupe note (Phase 04 precondition): the underlying `createAudioStore.fetch()`
// (see audio-library/hooks/create-audio-store.ts) does NOT short-circuit when an
// existing fetch is in-flight — it always sets isLoading=true and runs. To avoid
// triggering parallel fetches if multiple consumers mount simultaneously, the
// fetch trigger here is gated by both `isLoading` (store flag) AND a local
// `hasTriggeredFetchRef` (Option B from the phase doc — chosen because the audio
// store is shared with several library/player call sites and refactoring its
// fetch contract is out-of-scope for this task).

import { useEffect, useRef } from 'react';
import { createLogger } from '@/utils/logger';
import { useMusicsStore } from '@/stores/musics-store';

const log = createLogger('Editor', 'useMusicMediaUrl');

export function useMusicMediaUrl(backgroundId: string | null): string | null {
  // Selector subscribes only to this specific item's media_url — not the array.
  const mediaUrl = useMusicsStore((state) => {
    if (!backgroundId) return null;
    return state.items.find((m) => m.id === backgroundId)?.mediaUrl ?? null;
  });

  const hasItems = useMusicsStore((state) => state.items.length > 0);
  const isLoading = useMusicsStore((state) => state.isLoading);
  // Pass-through ref-stable action — DO NOT wrap in arrow inside useShallow.
  const fetchMusics = useMusicsStore((state) => state.fetch);

  const hasTriggeredFetchRef = useRef(false);

  // Trigger fetch if the store has not loaded yet.
  useEffect(() => {
    if (!backgroundId) return;
    if (hasItems) return;
    if (isLoading) return;
    if (hasTriggeredFetchRef.current) return;
    hasTriggeredFetchRef.current = true;
    log.debug('fetch', 'no musics in store, triggering fetch', { backgroundId });
    void fetchMusics();
  }, [backgroundId, hasItems, isLoading, fetchMusics]);

  // Dangling FK detection — items loaded but the requested id is missing.
  useEffect(() => {
    if (backgroundId && hasItems && !mediaUrl) {
      log.warn('resolve', 'dangling_background_id', { backgroundId });
    }
  }, [backgroundId, hasItems, mediaUrl]);

  return mediaUrl;
}
