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
    return data as R;
  } catch (err) {
    console.error(`[edge-fn] ${functionName} network error:`, err);
    return { success: false, error: 'Network error. Please try again.' } as R;
  }
}

/** Extract error message from non-2xx response body. */
async function extractErrorMessage(functionName: string, response: Response): Promise<string> {
  try {
    const body = await response.json();
    const message = body?.error || body?.message || `HTTP ${response.status}`;
    console.error(`[edge-fn] ${functionName} error:`, message);
    return message;
  } catch {
    // Response body not parseable as JSON
  }
  const fallback = `HTTP ${response.status} ${response.statusText}`;
  console.error(`[edge-fn] ${functionName} error:`, fallback);
  return fallback;
}
