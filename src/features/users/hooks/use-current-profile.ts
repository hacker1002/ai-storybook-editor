// use-current-profile.ts — Reads the CURRENT signed-in user's own role from
// `profiles` (public-SELECT under RLS) for UX gating only (RequireAdmin guard +
// sidebar). The server admin-gate is authoritative.
//
// Shared once-per-session cache (co-located zustand store) so every consumer
// (guard, sidebar, page) triggers at most one fetch per user. The effect calls
// STORE actions (not component setState), so it sidesteps the React-19
// set-state-in-effect lint. Cross-user staleness is prevented by keying the
// fetch on the string userId (not the user object → no refire on token refresh)
// and guarding the async write on the still-current `loadingFor`.

import { useEffect } from 'react';
import { create } from 'zustand';
import { supabase } from '@/apis/supabase';
import { useAuthUser } from '@/stores/auth-store';
import type { SystemRole } from '@/features/users/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Users', 'useCurrentProfile');

type LoadStatus = 'idle' | 'loading' | 'loaded';

interface CurrentProfileStore {
  /** userId the current role belongs to (null = signed out / not fetched). */
  fetchedFor: string | null;
  /** userId whose fetch is currently in-flight (dedupe / stale-write guard). */
  loadingFor: string | null;
  role: SystemRole | null;
  status: LoadStatus;
  /** Idempotent per userId: fetch own role once, dedupe concurrent/StrictMode calls. */
  ensureLoaded: (userId: string | null) => void;
}

const useCurrentProfileStore = create<CurrentProfileStore>((set, get) => ({
  fetchedFor: null,
  loadingFor: null,
  role: null,
  status: 'idle',

  ensureLoaded: (userId) => {
    // Signed out → reset to a clean idle state.
    if (!userId) {
      if (get().status !== 'idle' || get().role !== null || get().fetchedFor !== null) {
        log.debug('ensureLoaded', 'reset (signed out)');
        set({ fetchedFor: null, loadingFor: null, role: null, status: 'idle' });
      }
      return;
    }

    const s = get();
    if (s.fetchedFor === userId) {
      log.debug('ensureLoaded', 'cache hit', { userId });
      return; // once-per-session
    }
    if (s.status === 'loading' && s.loadingFor === userId) {
      log.debug('ensureLoaded', 'already in-flight', { userId });
      return; // dedupe concurrent + StrictMode double-invoke
    }

    log.info('ensureLoaded', 'fetching own role', { userId });
    set({ loadingFor: userId, status: 'loading', role: null });

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', userId)
          .single();

        // Ignore a stale response if the active user changed mid-flight.
        if (get().loadingFor !== userId) {
          log.debug('ensureLoaded', 'stale response ignored', { userId });
          return;
        }

        if (error) {
          // Fetch failure → treat as non-admin, never hang the guard.
          log.warn('ensureLoaded', 'role fetch failed; treating as non-admin', {
            userId,
            error: error.message,
          });
          set({ fetchedFor: userId, loadingFor: null, role: null, status: 'loaded' });
          return;
        }

        const role = (data?.role as SystemRole | undefined) ?? null;
        log.info('ensureLoaded', 'role loaded', { userId, role });
        set({ fetchedFor: userId, loadingFor: null, role, status: 'loaded' });
      } catch (err) {
        if (get().loadingFor !== userId) return;
        log.error('ensureLoaded', 'unexpected error; treating as non-admin', {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
        set({ fetchedFor: userId, loadingFor: null, role: null, status: 'loaded' });
      }
    })();
  },
}));

export interface CurrentProfile {
  userId: string | null;
  role: SystemRole | null;
  isLoading: boolean;
}

/**
 * Current user's identity + role for admin-UX gating.
 * - Signed out → `{ userId: null, role: null, isLoading: false }`.
 * - Signed in, role not yet resolved → `isLoading: true`.
 * - Role fetch error → `role: null` (non-admin) + `isLoading: false` (never hangs).
 */
export function useCurrentProfile(): CurrentProfile {
  const userId = useAuthUser()?.id ?? null;
  const role = useCurrentProfileStore((s) => s.role);
  const status = useCurrentProfileStore((s) => s.status);
  const fetchedFor = useCurrentProfileStore((s) => s.fetchedFor);
  const ensureLoaded = useCurrentProfileStore((s) => s.ensureLoaded);

  useEffect(() => {
    ensureLoaded(userId);
  }, [userId, ensureLoaded]);

  if (!userId) {
    return { userId: null, role: null, isLoading: false };
  }

  // Loading until this exact user's role has resolved.
  const isLoading = fetchedFor !== userId;
  return {
    userId,
    role: isLoading ? null : role,
    isLoading: isLoading || status === 'loading',
  };
}
