import { useCallback, useEffect, useRef, useState } from 'react';
import { createLogger } from '@/utils/logger';

const log = createLogger('Voices', 'AudioPlayer');

export interface VoiceAudioPlayer {
  playingId: string | null;
  play: (voiceId: string, url: string | null) => void;
  stop: () => void;
}

export function useVoiceAudioPlayer(): VoiceAudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
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

  const play = useCallback((voiceId: string, url: string | null) => {
    if (!url) {
      log.warn('play', 'no url', { voiceId });
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.src !== url) {
      audio.src = url;
    }
    audio.currentTime = 0;
    audio.play().catch((err) => {
      log.error('play', 'failed', { voiceId, err: String(err) });
      setPlayingId(null);
    });
    setPlayingId(voiceId);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    setPlayingId(null);
  }, []);

  return { playingId, play, stop };
}
