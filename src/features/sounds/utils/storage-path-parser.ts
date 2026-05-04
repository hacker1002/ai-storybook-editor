import { createLogger } from '@/utils/logger';

const log = createLogger('Sounds', 'StoragePathParser');

// Strict bucket parser per plan §Validation S1: only `storybook-assets`.
// Mismatch (legacy/external URL) → returns null and caller skips storage cleanup.
const STORAGE_PUBLIC_PATTERN =
  /\/storage\/v1\/object\/public\/storybook-assets\/(.+)$/;

/**
 * Parse the object path of a `storybook-assets` Supabase Storage public URL.
 * Returns the decoded path (relative to bucket root) on match, otherwise null.
 *
 * Examples:
 *   https://x.supabase.co/storage/v1/object/public/storybook-assets/sounds-uploaded/u/1.mp3
 *     → 'sounds-uploaded/u/1.mp3'
 *   https://cdn.example.com/whatever.mp3 → null
 */
export function parseStoragePathFromUrl(url: string | null | undefined): string | null {
  if (!url) {
    log.debug('parseStoragePathFromUrl', 'empty url', {});
    return null;
  }
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(STORAGE_PUBLIC_PATTERN);
    if (!match) {
      log.debug('parseStoragePathFromUrl', 'pattern mismatch', {
        pathname: parsed.pathname.slice(0, 80),
      });
      return null;
    }
    return decodeURIComponent(match[1]);
  } catch (err) {
    log.warn('parseStoragePathFromUrl', 'invalid URL', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
