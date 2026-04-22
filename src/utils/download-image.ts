import { createLogger } from '@/utils/logger';

const log = createLogger('Util', 'DownloadImage');

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
};

function extFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url, window.location.href).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    return match?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

function resolveExtension(blob: Blob, url: string): string {
  const mime = blob.type?.toLowerCase();
  if (mime && MIME_TO_EXT[mime]) return MIME_TO_EXT[mime];

  const urlExt = extFromUrl(url);
  if (urlExt && Object.values(MIME_TO_EXT).includes(urlExt)) return urlExt;

  log.warn('resolveExtension', 'unknown image type, falling back', { mime, url });
  return 'jpg';
}

/**
 * Fetch image as blob and trigger a browser download.
 *
 * Filename: `${stem || 'image'}_${Date.now()}.{ext}` where ext is derived from
 * the blob's MIME type, falling back to URL pathname, then `jpg`.
 */
export async function downloadImage(url: string, stem?: string): Promise<void> {
  log.debug('downloadImage', 'fetch blob', { url });

  const response = await fetch(url);
  if (!response.ok) {
    log.error('downloadImage', 'fetch failed', { url, status: response.status });
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();
  const ext = resolveExtension(blob, url);
  const blobUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${stem || 'image'}_${Date.now()}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
