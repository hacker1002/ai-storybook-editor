// player-audio-mixer-host.tsx — Host component that owns the audio mixer
// lifecycle while the player canvas is active.
//
// Renders nothing. Mounted conditionally by PlayableSpreadView when
// `activeCanvas === 'player'` so React's mount/unmount drives initContext()
// and teardown() inside `useAudioMixerLifecycle`. This keeps the rules of
// hooks intact (the lifecycle hook itself is always called once mounted)
// while still scoping AudioContext creation to player mode only.
//
// Design source: ai-storybook-design/component/editor-page/shared/playable-spread-view/03-10-audio-mixer.md §5.2
// Phase plan: plans/260505-1455-player-audio-mixer-frontend-impl/phase-05-wire-into-playable-spread-view.md (Bước 4)

import type { RefObject } from 'react';
import { useAudioMixerLifecycle } from './use-audio-mixer-lifecycle';
import type { BookAudioSettings } from './audio-mixer-types';

interface PlayerAudioMixerHostProps {
  rootRef: RefObject<HTMLDivElement | null>;
  masterVolume: number;
  isMuted: boolean;
  bookAudio: BookAudioSettings;
}

export function PlayerAudioMixerHost({
  rootRef,
  masterVolume,
  isMuted,
  bookAudio,
}: PlayerAudioMixerHostProps): null {
  useAudioMixerLifecycle({ rootRef, masterVolume, isMuted, bookAudio });
  return null;
}

export default PlayerAudioMixerHost;
