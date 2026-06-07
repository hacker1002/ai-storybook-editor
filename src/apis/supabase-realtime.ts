// supabase-realtime.ts — Shared Supabase Realtime helpers. Domain-agnostic so
// any store (BackgroundJobsStore, RemixStore) can push the session JWT into the
// realtime client BEFORE subscribing to an RLS-protected channel. Extracted out
// of remix-store/realtime.ts (ADR-037) so the unified BackgroundJobsStore reuses
// it without importing a domain store.

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'SupabaseRealtime');

/** Push current session JWT into supabase-js realtime client. Required so the
 *  RLS-protected `postgres_changes` events actually reach the subscriber —
 *  without this the channel subscribes anonymously and the server-side filter
 *  silently drops every event. Fire-and-forget safe: callers invoke it right
 *  before `.subscribe()` (which is sync) so the JWT lands before the JOIN frame. */
export async function ensureRealtimeAuth(): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      log.warn('ensureRealtimeAuth', 'getSession failed', { error: error.message });
      return;
    }
    const token = data.session?.access_token;
    if (!token) {
      log.warn('ensureRealtimeAuth', 'no access_token on session');
      return;
    }
    supabase.realtime.setAuth(token);
    log.debug('ensureRealtimeAuth', 'realtime auth set');
  } catch (err) {
    log.warn('ensureRealtimeAuth', 'unexpected', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
