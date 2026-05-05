// create-mixed-audio.ts - Shared helper for creating DOM-attached <audio> wired
// into the player audio mixer. Used by quiz/branch narration + SFX so they
// respect master volume / mute / per-channel scale (same pattern as Phase 06
// quiz-audio refactor).
import { usePlayerAudioStore } from '@/stores/player-audio-store';
import type { AudioChannel } from './audio-mixer-types';

/**
 * Create a DOM-attached <audio> wired into the player audio mixer.
 * The element is appended to <body> (display:none) and registered with the
 * mixer store via attachAudio(). On natural completion ('ended') the element
 * removes itself; for stop-mid-play the caller MUST pause() and remove() it
 * explicitly (the store cleans up its WeakMap entries on element removal).
 */
export function createMixedAudio(url: string, channel: AudioChannel): HTMLAudioElement {
  const el = document.createElement('audio');
  el.src = url;
  el.crossOrigin = 'anonymous';
  el.dataset.audioChannel = channel;
  el.style.display = 'none';
  document.body.appendChild(el);
  usePlayerAudioStore.getState().attachAudio(el);
  el.addEventListener('ended', () => el.remove());
  return el;
}
