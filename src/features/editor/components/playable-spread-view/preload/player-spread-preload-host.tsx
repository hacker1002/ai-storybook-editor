// player-spread-preload-host.tsx — Host component that owns the spread media
// preload lifecycle while the player canvas is active.
//
// Renders nothing. Mounted conditionally by PlayableSpreadView when
// `activeCanvas === 'player'` so React's mount/unmount drives the sliding
// window (un)scheduling inside `usePlayerSpreadPreload`. Mirrors
// PlayerAudioMixerHost to keep player-mode-only side effects scoped via the
// React tree (no `enabled` flag toggling effect lifecycle).
//
// Spec: ai-storybook-design/component/editor-page/shared/playable-spread-view/03-11-spread-media-preload.md §8

import { useEffect } from 'react';
import type { PlayableSpread } from '@/types/playable-types';
import {
  useNarrationLanguage,
  useQuizLanguage,
} from '@/stores/animation-playback-store';
import { usePlayerAudioStore } from '@/stores/player-audio-store';
import { usePlayerSpreadPreload } from '../hooks/use-player-spread-preload';

interface PlayerSpreadPreloadHostProps {
  spreads: PlayableSpread[];
  activeSpreadId: string;
}

export function PlayerSpreadPreloadHost({
  spreads,
  activeSpreadId,
}: PlayerSpreadPreloadHostProps): null {
  const narrationLangCode = useNarrationLanguage();
  const quizLangCode = useQuizLanguage();

  // On language switch, all pooled audio URLs are stale (different localized
  // tracks). Evict everything; preload tier re-primes the new URL set on the
  // next render. Tween reset on lang change (parent behaviour) means in-flight
  // playback is going to be killed anyway, so a hard pause here is safe.
  useEffect(() => {
    return () => {
      usePlayerAudioStore.getState().releaseAllAudio();
    };
  }, [narrationLangCode, quizLangCode]);

  usePlayerSpreadPreload({
    spreads,
    activeSpreadId,
    narrationLangCode,
    quizLangCode,
  });
  return null;
}

export default PlayerSpreadPreloadHost;
