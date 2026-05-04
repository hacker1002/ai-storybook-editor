import { createLogger } from '@/utils/logger';

const log = createLogger('AudioLibrary', 'StoragePathParser');

// Match `/storage/v1/object/public/storybook-assets/<path>` URLs and capture the path.
const STORAGE_PUBLIC_PATTERN =
  /\/storage\/v1\/object\/public\/storybook-assets\/(.+)$/;

/**
 * Parse the object path of a `storybook-assets` Supabase Storage public URL.
 * Returns the decoded path on match if it starts with one of the allowed
 * `prefixes`, else null. Caller skips Storage cleanup when null is returned.
 */
export function parseStoragePathFromUrl(
  url: string | null | undefined,
  prefixes: string[],
): string | null {
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
    const path = decodeURIComponent(match[1]);
    if (prefixes.length > 0 && !prefixes.some((p) => path.startsWith(p + '/') || path === p)) {
      log.debug('parseStoragePathFromUrl', 'prefix mismatch', {
        path: path.slice(0, 60),
        prefixes,
      });
      return null;
    }
    return path;
  } catch (err) {
    log.warn('parseStoragePathFromUrl', 'invalid URL', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
