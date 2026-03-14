import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'EdgeFunctionClient');

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseApiKey = import.meta.env.VITE_SUPABASE_API_ANON_KEY;

/**
 * Shared edge function caller using raw fetch.
 * Sets Authorization: Bearer <API_KEY> as required by Supabase edge functions.
 * Generic R = full response type from the edge function (must have success + optional error).
 */
export async function callEdgeFunction<R extends { success: boolean; error?: string }>(
  functionName: string,
  body: object
): Promise<R> {
  const url = `${supabaseUrl}/functions/v1/${functionName}`;
  const payload = body as Record<string, unknown>;

  log.info('callEdgeFunction', 'request', { functionName, method: 'POST', payloadKeys: Object.keys(payload || {}) });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseApiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await extractErrorMessage(functionName, response);
      return { success: false, error: message } as R;
    }

    const data = await response.json();
    log.debug('callEdgeFunction', 'response ok', { functionName, status: response.status });
    return data as R;
  } catch (err) {
    log.error('callEdgeFunction', 'network error', { functionName, error: err });
    return { success: false, error: 'Network error. Please try again.' } as R;
  }
}

/** Extract error message from non-2xx response body. */
async function extractErrorMessage(functionName: string, response: Response): Promise<string> {
  try {
    const body = await response.json();
    const message = body?.error || body?.message || `HTTP ${response.status}`;
    log.error('extractErrorMessage', 'http error', { functionName, message, status: response.status });
    return message;
  } catch {
    // Response body not parseable as JSON
  }
  const fallback = `HTTP ${response.status} ${response.statusText}`;
  log.error('extractErrorMessage', 'http error (no body)', { functionName, fallback, status: response.status });
  return fallback;
}
