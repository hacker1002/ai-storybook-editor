import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'ImageApiClient');

const imageApiBaseUrl = import.meta.env.VITE_IMAGE_API_BASE_URL as string;
const imageApiKey = import.meta.env.VITE_IMAGE_API_KEY as string;

/**
 * Generic client for the FastAPI image-api service.
 * Uses X-API-Key header (service-to-service auth) instead of Supabase Bearer JWT.
 * Normalizes FastAPI error shape { code, message } → flat error string for caller compatibility.
 */
export async function callImageApi<R extends { success: boolean; error?: string }>(
  path: string,
  body: object
): Promise<R> {
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
      const message = await extractErrorMessage(path, response);
      return { success: false, error: message } as R;
    }

    const data = await response.json();
    log.debug('callImageApi', 'response ok', { path, status: response.status });
    return data as R;
  } catch (err) {
    log.error('callImageApi', 'network error', { path, error: err });
    return { success: false, error: 'Network error. Please try again.' } as R;
  }
}

async function extractErrorMessage(path: string, response: Response): Promise<string> {
  try {
    const body = await response.json();
    // FastAPI error shape: { success: false, error: { code, message } }
    const errorField = body?.error;
    const message =
      typeof errorField === 'object' && errorField !== null
        ? (errorField.message ?? JSON.stringify(errorField))
        : (errorField ?? body?.message ?? `HTTP ${response.status}`);
    log.error('extractErrorMessage', 'http error', { path, message, status: response.status });
    return String(message);
  } catch {
    // Response body not parseable as JSON
  }
  const fallback = `HTTP ${response.status} ${response.statusText}`;
  log.error('extractErrorMessage', 'http error (no body)', { path, fallback, status: response.status });
  return fallback;
}
