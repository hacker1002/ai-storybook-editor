// resource-lock-store/holder-names.ts — Batch-resolve holder user ids to display
// names for lock tooltips. `profiles` is public-SELECT under RLS and contains no
// email, so a plain client SELECT is safe here (the candidate-users email RPC is
// NOT needed — we only want `name`).

import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'ResourceLockHolderNames');

/** Fetch `{ user_id, name }` for the given user ids. Missing rows are simply
 *  absent from the result (caller applies a fallback). Errors → empty array. */
export async function fetchProfileNames(
  userIds: string[]
): Promise<Array<{ user_id: string; name: string | null }>> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, name')
    .in('user_id', userIds);
  if (error) {
    log.warn('fetchProfileNames', 'profile name fetch failed', {
      count: userIds.length,
      error: error.message,
    });
    return [];
  }
  return (data ?? []) as Array<{ user_id: string; name: string | null }>;
}
