// book-background-music-player.tsx — Invisible <audio loop> element streaming book BGM.
//
// Design source: ai-storybook-design/component/editor-page/shared/playable-spread-view/03-10-audio-mixer.md §5.1
// Phase plan: plans/260505-1455-player-audio-mixer-frontend-impl/phase-03-book-background-music-player.md
//
// Mounted in PlayableSpreadView (NOT PlayerCanvas) so spread changes don't restart
// the BGM. Volume is NOT controlled via el.volume — output goes through the mixer
// gainBgm. Playback is routed through playerAudioStore.requestPlay so it queues
// gracefully when the AudioContext is still suspended (pre-gesture) and then
// flushes via FirstGestureGate's resumeContext call.

import { useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@/utils/logger';
import {
  useContextCreated,
  usePlayerAudioActions,
} from '@/stores/player-audio-store';

const log = createLogger('Editor', 'BookBackgroundMusicPlayer');

export interface BookBackgroundMusicPlayerProps {
  /** Resolved BGM URL (from useMusicMediaUrl). When null, component returns null. */
  mediaUrl: string | null;
}

export function BookBackgroundMusicPlayer({ mediaUrl }: BookBackgroundMusicPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const actions = usePlayerAudioActions();
  const contextCreated = useContextCreated();

  // Attach to mixer + request playback whenever the context is ready or the URL changes.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !mediaUrl || !contextCreated) return;

    actions.attachAudio(el);
    actions.requestPlay(el);
    log.debug('autoplay', 'book_bgm_request_play', { hasMediaUrl: true });

    return () => {
      // Cleanup: pause + remove from autoStartQueue. Do NOT mutate el.src —
      // it is React-owned (Strict-Mode double-mount safety).
      actions.cancelPlay(el);
    };
  }, [contextCreated, mediaUrl, actions]);

  const handleError = useCallback(
    (e: React.SyntheticEvent<HTMLAudioElement>) => {
      log.error('onError', 'book_bgm_load_error', {
        mediaUrl,
        errorCode: e.currentTarget.error?.code,
      });
    },
    [mediaUrl],
  );

  if (!mediaUrl) return null;

  return (
    <audio
      ref={audioRef}
      src={mediaUrl}
      loop
      preload="auto"
      crossOrigin="anonymous"
      data-audio-channel="bgm"
      aria-hidden="true"
      onError={handleError}
    />
  );
}

export default BookBackgroundMusicPlayer;
