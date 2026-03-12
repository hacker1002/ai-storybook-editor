import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Shared edge function caller using supabase.functions.invoke().
 * Replaces raw fetch + manual env/auth/URL handling across API modules.
 * Generic R = full response type from the edge function (must have success + optional error).
 */
export async function callEdgeFunction<R extends { success: boolean; error?: string }>(
  functionName: string,
  body: object
): Promise<R> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, { body });

    if (error) {
      const message = await extractErrorMessage(functionName, error);
      return { success: false, error: message } as R;
    }

    return data as R;
  } catch (err) {
    console.error(`[edge-fn] ${functionName} network error:`, err);
    return { success: false, error: 'Network error. Please try again.' } as R;
  }
}

// Extract specific error message from edge function non-2xx responses.
// supabase.functions.invoke() wraps non-2xx as FunctionsHttpError with a generic message,
// but the actual error is in the response body accessible via error.context.
async function extractErrorMessage(functionName: string, error: Error): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      const message = body?.error || body?.message || `HTTP error`;
      console.error(`[edge-fn] ${functionName} error:`, message);
      return message;
    } catch {
      // Response body not parseable as JSON
    }
  }
  console.error(`[edge-fn] ${functionName} error:`, error);
  return error.message || 'Edge function error';
}
