// audio-mixer-types.ts
// Shared types + pure helper for the player audio mixer.
//
// Design source: ai-storybook-design/component/editor-page/shared/playable-spread-view/03-10-audio-mixer.md §3, §5.2
//
// IMPORTANT: helper does NOT clamp at 1.0 — Web Audio GainNode supports >1
// (amplification). Volume scales come from book.music.volume_scale,
// book.sound.volume_scale (range 0..2) and narrator.volume_scale.

import type { BookMusicSettings, BookSoundSettings } from '@/types/editor';

export type AudioChannel = 'bgm' | 'sfx' | 'narration';

export const AUDIO_CHANNELS: readonly AudioChannel[] = ['bgm', 'sfx', 'narration'] as const;

export const GAIN_RAMP_SECONDS = 0.05; // 50ms — smooth ramp to avoid zipper noise

export interface BookAudioSettings {
  music: BookMusicSettings;            // background_id + volume_scale
  sound: BookSoundSettings;            // transition_id, true_id, wrong_id, volume_scale
  narratorVolumeScale: number;         // resolved from useBookNarratorVolume()
}

export interface EffectiveGainArgs {
  masterVolume: number;     // 0..100
  isMuted: boolean;
  bookAudio: BookAudioSettings;
}

export function effectiveGain(channel: AudioChannel, args: EffectiveGainArgs): number {
  if (args.isMuted) return 0;
  const scale =
    channel === 'bgm'       ? args.bookAudio.music.volume_scale :
    channel === 'sfx'       ? args.bookAudio.sound.volume_scale :
                              args.bookAudio.narratorVolumeScale;
  // KHÔNG clamp — GainNode hỗ trợ >1
  return (args.masterVolume / 100) * (scale ?? 1);
}

/**
 * Truncate a (possibly signed) URL for logging — keep the last `max` characters
 * prefixed with an ellipsis. Avoids leaking long signed query tokens at info/warn
 * level while still preserving enough tail context to identify the file.
 */
export function truncateSrc(url: string | null | undefined, max = 40): string {
  if (!url) return '';
  return url.length <= max ? url : `…${url.slice(-max)}`;
}
