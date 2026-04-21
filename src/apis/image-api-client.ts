import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'ImageApiClient');

const imageApiBaseUrl = import.meta.env.VITE_IMAGE_API_BASE_URL as string;
const imageApiKey = import.meta.env.VITE_IMAGE_API_KEY as string;

/** Failure shape returned by callImageApi on non-2xx or network error. */
export interface ImageApiFailure {
  success: false;
  error: string;
  httpStatus: number;
  errorCode?: string;
}

/**
 * Generic client for the FastAPI image-api service.
 * Uses X-API-Key header (service-to-service auth) instead of Supabase Bearer JWT.
 * On failure returns ImageApiFailure (success: false) with httpStatus + errorCode for
 * precise downstream classification — callers cast via `as ImageApiFailure` after !success check.
 */
export async function callImageApi<R extends { success: boolean; error?: string }>(
  path: string,
  body: object
): Promise<R | ImageApiFailure> {
  const url = `${imageApiBaseUrl}${path}`;
  const payload = body as Record<string, unknown>;

  log.info('callImageApi', 'request', { path, method: 'POST', payloadKeys: Object.keys(payload || {}) });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': imageApiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const { message, errorCode } = await extractErrorInfo(path, response);
      return { success: false, error: message, httpStatus: response.status, errorCode };
    }

    const data = await response.json();
    log.debug('callImageApi', 'response ok', { path, status: response.status });
    return data as R;
  } catch (err) {
    log.error('callImageApi', 'network error', { path, error: err });
    return { success: false, error: 'Network error. Please try again.', httpStatus: 0 };
  }
}

async function extractErrorInfo(
  path: string,
  response: Response
): Promise<{ message: string; errorCode?: string }> {
  try {
    const body = await response.json();
    // FastAPI HTTPException shape: { detail: { error: { code, message } } }
    // FastAPI string detail:        { detail: "string" }
    // Top-level fallbacks:          { error: { code, message } } | { error: string } | { message: string }
    const detail = body?.detail;
    const detailError = typeof detail === 'object' && detail !== null ? detail.error : undefined;

    const errorCode: string | undefined =
      (typeof detailError === 'object' && detailError !== null ? detailError.code : undefined) ??
      (typeof body?.error === 'object' && body.error !== null ? body.error.code : undefined);

    const message: string =
      (typeof detailError === 'object' && detailError !== null && typeof detailError.message === 'string'
        ? detailError.message
        : null) ??
      (typeof detail === 'string' ? detail : null) ??
      (typeof body?.error === 'object' && body.error !== null
        ? (body.error.message ?? JSON.stringify(body.error))
        : null) ??
      (typeof body?.error === 'string' ? body.error : null) ??
      body?.message ??
      `HTTP ${response.status}`;

    log.error('extractErrorInfo', 'http error', { path, message, errorCode, status: response.status });
    return { message: String(message), errorCode };
  } catch {
    // Response body not parseable as JSON
  }
  const fallback = `HTTP ${response.status} ${response.statusText}`;
  log.error('extractErrorInfo', 'http error (no body)', { path, fallback, status: response.status });
  return { message: fallback };
}
