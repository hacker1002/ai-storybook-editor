// use-quiz-audio.ts - Manages exclusive audio playback for quiz modal + parallel SFX
// Audio elements are DOM-attached + explicitly routed through PlayerAudioMixer (narration | sfx).
import { useRef, useCallback, useEffect } from 'react';
import { createLogger } from '@/utils/logger';
import { createMixedAudio } from '../audio/create-mixed-audio';

const log = createLogger('Editor', 'useQuizAudio');

const SFX_CORRECT_URL = '/audios/sfx-correct.mp3';
const SFX_WRONG_URL = '/audios/sfx-wrong.mp3';

export function useQuizAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const sfxRefsRef = useRef<Set<HTMLAudioElement>>(new Set());

  // Cleanup on unmount
  useEffect(() => {
    const sfxRefs = sfxRefsRef.current;
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.remove();
        audioRef.current = null;
      }
      currentUrlRef.current = null;
      // Stop + remove all SFX instances
      sfxRefs.forEach((sfx) => {
        sfx.pause();
        sfx.remove();
      });
      sfxRefs.clear();
    };
  }, []);

  const stopAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.remove();
      audioRef.current = null;
    }
    currentUrlRef.current = null;
    // Stop + remove all SFX instances
    sfxRefsRef.current.forEach((sfx) => {
      sfx.pause();
      sfx.remove();
    });
    sfxRefsRef.current.clear();
  }, []);

  const playAudio = useCallback((url: string) => {
    log.info('playAudio', 'playing audio', { url });
    // Stop current if different or replay if same
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.remove();
      audioRef.current = null;
    }

    const audio = createMixedAudio(url, 'narration');
    audio.addEventListener('ended', () => {
      if (currentUrlRef.current === url) {
        currentUrlRef.current = null;
      }
      audio.remove();
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    });
    audioRef.current = audio;
    currentUrlRef.current = url;
    audio.play().catch((err) => {
      log.error('playAudio', 'playback failed', { error: err, url });
      currentUrlRef.current = null;
      audio.remove();
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
    });
  }, []);

  // SFX plays independently (doesn't stop main audio), tracked for cleanup
  const playSfx = useCallback((type: 'correct' | 'wrong') => {
    const url = type === 'correct' ? SFX_CORRECT_URL : SFX_WRONG_URL;
    const sfx = createMixedAudio(url, 'sfx');
    sfxRefsRef.current.add(sfx);
    sfx.addEventListener('ended', () => {
      sfxRefsRef.current.delete(sfx);
      sfx.remove();
    });
    sfx.play().catch(() => {
      sfxRefsRef.current.delete(sfx);
      sfx.remove();
    });
  }, []);

  return { playAudio, stopAll, playSfx };
}
