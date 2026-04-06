// share-api.ts - API client for share preview edge function (raw fetch, non-standard response)
import { createLogger } from '@/utils/logger';
import type { SharePreviewResult } from '@/types/share-preview-types';

const log = createLogger('API', 'ShareApi');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseApiKey = import.meta.env.VITE_SUPABASE_API_ANON_KEY;

/**
 * Fetch share preview data from edge function.
 * Uses raw fetch (not callEdgeFunction) because response schema is non-standard.
 * @param slug - Share link slug
 * @param passcode - Optional passcode for private links
 */
export async function fetchSharePreview(
  slug: string,
  passcode?: string
): Promise<SharePreviewResult> {
  const url = `${supabaseUrl}/functions/v1/share-get-book-preview`;
  const body: Record<string, unknown> = { slug };
  if (passcode) body.passcode = passcode;

  log.info('fetchSharePreview', 'request', { slug, hasPasscode: !!passcode });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseApiKey}`,
      },
      body: JSON.stringify(body),
    });

    // 404 → not found
    if (response.status === 404) {
      log.debug('fetchSharePreview', 'not found', { slug, status: 404 });
      return { status: 'not_found' };
    }

    // 401 → invalid passcode
    if (response.status === 401) {
      log.debug('fetchSharePreview', 'invalid passcode', { slug, status: 401 });
      return { status: 'invalid_passcode' };
    }

    // 429 → rate limited
    if (response.status === 429) {
      log.warn('fetchSharePreview', 'rate limited', { slug, status: 429 });
      return { status: 'rate_limited' };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      log.error('fetchSharePreview', 'unexpected http error', { slug, status: response.status, body: text });
      return { status: 'error', message: `HTTP ${response.status}` };
    }

    const data = await response.json();
    log.debug('fetchSharePreview', 'response ok', { slug, hasPasscodeRequired: !!data.requires_passcode });

    // 200 + requires_passcode → passcode prompt
    if (data.requires_passcode) {
      return { status: 'requires_passcode', name: data.name ?? '' };
    }

    // 200 + shareConfig → ready
    if (data.shareConfig) {
      return {
        status: 'ready',
        shareConfig: data.shareConfig,
        book: data.book,
        snapshot: data.snapshot ?? null,
      };
    }

    log.error('fetchSharePreview', 'unrecognized response shape', { slug });
    return { status: 'error', message: 'Unexpected response from server.' };
  } catch (err) {
    log.error('fetchSharePreview', 'network error', { slug, error: err });
    return { status: 'error', message: 'Network error. Please try again.' };
  }
}
