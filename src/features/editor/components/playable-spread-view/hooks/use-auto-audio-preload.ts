// use-auto-audio-preload.ts
// Lookahead preload BGM của next spread (Section 5.4.4 — playable-spread-view spec).
// - Current spread KHÔNG preload (component EditableAutoAudio đã mount <audio> + gọi play() imperatively).
// - Defer 1000ms để current spread chiếm bandwidth priority.
// - Dedupe vs current URLs → tránh double-fetch khi 2 spreads dùng cùng media_url.
// - End of book: nextSpread === undefined → no-op.
'use client';

import { useEffect } from 'react';
import type { PlayableSpread } from '@/types/playable-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useAutoAudioPreload');

const AUTO_AUDIO_NEXT_PRELOAD_DELAY_MS = 1000;

function collectAutoAudioUrls(spread?: PlayableSpread): string[] {
  if (!spread || !spread.auto_audios) return [];
  const urls = new Set<string>();
  for (const a of spread.auto_audios) {
    if (a.media_url) urls.add(a.media_url);
  }
  return Array.from(urls);
}

function preloadUrls(urls: string[]): HTMLAudioElement[] {
  return urls.map((url) => {
    const a = new Audio();
    a.preload = 'auto';
    a.src = url;
    a.load();
    return a;
  });
}

interface UseAutoAudioPreloadParams {
  spread: PlayableSpread;
  nextSpread?: PlayableSpread;
}

export function useAutoAudioPreload({
  spread,
  nextSpread,
}: UseAutoAudioPreloadParams): void {
  useEffect(() => {
    const currentUrls = collectAutoAudioUrls(spread);
    const nextUrls = collectAutoAudioUrls(nextSpread).filter(
      (u) => !currentUrls.includes(u)
    );
    if (nextUrls.length === 0) return;

    log.debug('schedulePreload', 'scheduling next-spread auto-audio preload', {
      spreadId: spread.id,
      nextCount: nextUrls.length,
    });

    let preloaders: HTMLAudioElement[] = [];
    const timeoutId = setTimeout(() => {
      preloaders = preloadUrls(nextUrls);
      log.debug('runPreload', 'next-spread preload started', {
        spreadId: spread.id,
        count: preloaders.length,
      });
    }, AUTO_AUDIO_NEXT_PRELOAD_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
      preloaders.forEach((a) => {
        a.src = '';
      });
    };
  }, [spread.id, nextSpread?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}
