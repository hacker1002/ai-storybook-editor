// use-quiz-audio.ts - Manages exclusive audio playback for quiz modal + parallel SFX
import { useRef, useCallback, useEffect } from 'react';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useQuizAudio');

const SFX_CORRECT_URL = '/audios/sfx-correct.mp3';
const SFX_WRONG_URL = '/audios/sfx-wrong.mp3';

export function useQuizAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const sfxRefsRef = useRef<Set<HTMLAudioElement>>(new Set());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      currentUrlRef.current = null;
      // Stop all SFX instances
      sfxRefsRef.current.forEach((sfx) => {
        sfx.pause();
      });
      sfxRefsRef.current.clear();
    };
  }, []);

  const stopAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    currentUrlRef.current = null;
    // Stop all SFX instances
    sfxRefsRef.current.forEach((sfx) => {
      sfx.pause();
    });
    sfxRefsRef.current.clear();
  }, []);

  const playAudio = useCallback((url: string) => {
    log.info('playAudio', 'playing audio', { url });
    // Stop current if different or replay if same
    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(url);
    audio.addEventListener('ended', () => {
      if (currentUrlRef.current === url) {
        currentUrlRef.current = null;
      }
    });
    audioRef.current = audio;
    currentUrlRef.current = url;
    audio.play().catch((err) => {
      log.error('playAudio', 'playback failed', { error: err, url });
      currentUrlRef.current = null;
    });
  }, []);

  // SFX plays independently (doesn't stop main audio), tracked for cleanup
  const playSfx = useCallback((type: 'correct' | 'wrong') => {
    const url = type === 'correct' ? SFX_CORRECT_URL : SFX_WRONG_URL;
    const sfx = new Audio(url);
    sfxRefsRef.current.add(sfx);
    sfx.addEventListener('ended', () => {
      sfxRefsRef.current.delete(sfx);
    });
    sfx.play().catch(() => {
      sfxRefsRef.current.delete(sfx);
    });
  }, []);

  return { playAudio, stopAll, playSfx };
}
