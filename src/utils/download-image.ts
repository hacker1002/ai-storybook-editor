import { createLogger } from '@/utils/logger';

const log = createLogger('Util', 'DownloadImage');

/**
 * Fetch image as blob and trigger a browser download with a generated filename.
 *
 * Filename: `${stem || 'image'}_${Date.now()}.jpg`.
 *
 * Throws if the fetch fails — caller decides how to surface to the user.
 */
export async function downloadImage(url: string, stem?: string): Promise<void> {
  log.debug('downloadImage', 'fetch blob', { url });

  const response = await fetch(url);
  if (!response.ok) {
    log.error('downloadImage', 'fetch failed', { url, status: response.status });
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${stem || 'image'}_${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
