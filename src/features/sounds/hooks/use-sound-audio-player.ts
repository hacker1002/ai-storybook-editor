import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@/utils/logger';

const log = createLogger('Sounds', 'AudioPlayer');

export interface SoundAudioPlayer {
  playingId: string | null;
  /**
   * Play given sound. Singleton — playing a new sound replaces the previous.
   * `loop=true` mirrors the source `Sound.loop` flag so ambient/loop sounds
   * keep cycling until `stop()` is called.
   */
  play: (soundId: string, url: string | null, loop: boolean) => void;
  stop: () => void;
}

/**
 * Page-level singleton audio player for the Sounds feature.
 * Forks `useVoiceAudioPlayer` to add a `loop` flag without mutating the
 * voices hook (kept stable for unrelated callers).
 */
export function useSoundAudioPlayer(): SoundAudioPlayer {
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

  const play = useCallback((soundId: string, url: string | null, loop: boolean) => {
    if (!url) {
      log.warn('play', 'no url', { soundId });
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      log.debug('play', 'audio ref not ready', { soundId });
      return;
    }
    if (audio.src !== url) {
      audio.src = url;
    }
    audio.loop = loop;
    audio.currentTime = 0;
    audio.play().catch((err) => {
      log.error('play', 'failed', { soundId, err: String(err) });
      setPlayingId(null);
    });
    setPlayingId(soundId);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    setPlayingId(null);
  }, []);

  return { playingId, play, stop };
}
