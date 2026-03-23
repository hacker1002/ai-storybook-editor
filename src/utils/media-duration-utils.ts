// media-duration-utils.ts - Fetch duration (in ms) from video/audio media URLs

import { createLogger } from '@/utils/logger';

const log = createLogger('Util', 'MediaDuration');

/**
 * Fetch the duration of a video or audio media URL.
 * Creates a temporary HTMLMediaElement, loads metadata, and resolves with duration in ms.
 * Returns null if the URL is missing, duration cannot be determined, or timeout is reached.
 */
export function fetchMediaDurationMs(
  url: string,
  timeoutMs = 10_000,
): Promise<number | null> {
  return new Promise((resolve) => {
    if (!url) {
      log.debug('fetchMediaDurationMs', 'empty url, skipping');
      resolve(null);
      return;
    }

    const isVideo = /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
    const mediaEl = isVideo
      ? document.createElement('video')
      : document.createElement('audio');

    let settled = false;
    const settle = (value: number | null) => {
      if (settled) return;
      settled = true;
      mediaEl.src = '';
      mediaEl.removeAttribute('src');
      mediaEl.load(); // release network resources
      resolve(value);
    };

    const timer = window.setTimeout(() => {
      log.warn('fetchMediaDurationMs', 'timeout loading metadata', { url, timeoutMs });
      settle(null);
    }, timeoutMs);

    mediaEl.preload = 'metadata';

    mediaEl.addEventListener('loadedmetadata', () => {
      clearTimeout(timer);
      if (Number.isFinite(mediaEl.duration)) {
        const durationMs = Math.round(mediaEl.duration * 1000);
        log.debug('fetchMediaDurationMs', 'resolved', { url, durationMs });
        settle(durationMs);
      } else {
        log.warn('fetchMediaDurationMs', 'non-finite duration', { url });
        settle(null);
      }
    });

    mediaEl.addEventListener('error', () => {
      clearTimeout(timer);
      log.warn('fetchMediaDurationMs', 'failed to load media', { url });
      settle(null);
    });

    mediaEl.src = url;
  });
}

/**
 * Find the media_url for a target item (video or audio) from a spread's item arrays.
 */
export function findMediaUrlFromSpread(
  spread: { videos?: Array<{ id: string; media_url?: string }>; audios?: Array<{ id: string; media_url?: string }> } | undefined,
  targetId: string,
  targetType: string,
): string | null {
  if (!spread) return null;

  if (targetType === 'video') {
    const video = spread.videos?.find((v) => v.id === targetId);
    return video?.media_url ?? null;
  }
  if (targetType === 'audio') {
    const audio = spread.audios?.find((a) => a.id === targetId);
    return audio?.media_url ?? null;
  }

  return null;
}
