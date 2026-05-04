import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@/utils/logger';

const log = createLogger('AudioLibrary', 'AudioPlayer');

export interface SingletonAudioPlayer {
  playingId: string | null;
  /**
   * Play given audio. Singleton — playing a new item replaces the previous.
   * `loop=true` makes the underlying <audio> element loop until `stop()` is called.
   */
  play: (itemId: string, url: string | null, loop: boolean) => void;
  stop: () => void;
}

export function useSingletonAudioPlayer(): SingletonAudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handleEnded = () => {
      log.debug('ended', 'playback finished');
      setPlayingId(null);
    };
    const handleError = () => {
      log.warn('error', 'audio error event');
      setPlayingId(null);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.src = '';
      audioRef.current = null;
    };
  }, []);

  const play = useCallback((itemId: string, url: string | null, loop: boolean) => {
    if (!url) {
      log.warn('play', 'no url', { itemId });
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      log.debug('play', 'audio ref not ready', { itemId });
      return;
    }
    if (audio.src !== url) {
      audio.src = url;
    }
    audio.loop = loop;
    audio.currentTime = 0;
    audio.play().catch((err) => {
      log.error('play', 'failed', { itemId, err: String(err) });
      setPlayingId(null);
    });
    setPlayingId(itemId);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    setPlayingId(null);
  }, []);

  return { playingId, play, stop };
}
