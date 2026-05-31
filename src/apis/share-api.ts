// share-api.ts - API client for share preview FastAPI endpoint (raw fetch, non-standard response)
import { createLogger } from '@/utils/logger';
import type {
  BookPreviewData,
  SharePreviewResult,
  SnapshotPreviewData,
} from '@/types/share-preview-types';

const log = createLogger('API', 'ShareApi');

const imageApiBaseUrl = import.meta.env.VITE_IMAGE_API_BASE_URL;

/** Render params echoed by the token-gated get-render-preview endpoint. The print
 *  page reads render config from here — it never decodes the token itself. */
export interface RenderConfig {
  edition: 'classic' | 'dynamic' | 'interactive';
  language: string;
  bleed_mm: number;
  spread_id: string;
}

export interface RenderPreviewResult {
  book: BookPreviewData;
  /** illustration with exactly 1 spread (= token.spread_id), already language-filtered */
  illustration: SnapshotPreviewData['illustration'];
  renderConfig: RenderConfig;
}

/** Thrown by loadRenderPreview on non-2xx so the page can map status → message. */
export class RenderPreviewError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`get-render-preview failed: HTTP ${status}`);
    this.name = 'RenderPreviewError';
    this.status = status;
  }
}

/**
 * Load one spread for the print/PDF route via the token-gated FastAPI endpoint.
 * Service-to-service auth is the signed render token in the POST body — NO
 * X-API-Key, NO Authorization header. Source (book|remix) resolves server-side
 * from the token; response shape is identical for both.
 * @throws RenderPreviewError on non-2xx (401 expired/invalid, 404 not found).
 */
export async function loadRenderPreview(token: string): Promise<RenderPreviewResult> {
  const url = `${imageApiBaseUrl}/api/share/get-render-preview`;
  log.info('loadRenderPreview', 'request', { tokenLen: token.length });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    log.error('loadRenderPreview', 'http error', { status: response.status });
    throw new RenderPreviewError(response.status);
  }

  const data = await response.json();

  // Guard malformed 200: a token-gated success must carry book + 1-spread snapshot
  // + renderConfig. Surface as RenderPreviewError so the page maps it cleanly
  // instead of a raw TypeError swallowed as "unknown".
  if (!data?.book || !data?.snapshot?.illustration || !data?.renderConfig) {
    log.error('loadRenderPreview', 'malformed 200 response shape', {
      hasBook: !!data?.book,
      hasSnapshot: !!data?.snapshot?.illustration,
      hasRenderConfig: !!data?.renderConfig,
    });
    throw new RenderPreviewError(response.status);
  }

  log.debug('loadRenderPreview', 'response ok', {
    spreadId: data.renderConfig.spread_id,
  });

  return {
    book: data.book,
    illustration: data.snapshot.illustration,
    renderConfig: data.renderConfig,
  };
}

/**
 * Fetch share preview data from the FastAPI image-api.
 * Public endpoint — no Authorization header. Slug-based access.
 * @param slug - Share link slug
 * @param passcode - Optional passcode for private links
 */
export async function fetchSharePreview(
  slug: string,
  passcode?: string
): Promise<SharePreviewResult> {
  const url = `${imageApiBaseUrl}/api/share/get-book-preview`;
  const body: Record<string, unknown> = { slug };
  if (passcode) body.passcode = passcode;

  log.info('fetchSharePreview', 'request', { slug, hasPasscode: !!passcode });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
