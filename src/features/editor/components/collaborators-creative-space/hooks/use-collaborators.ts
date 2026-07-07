// use-collaborators — owner-scoped data layer for CollaboratorsCreativeSpace.
//
// Mirrors shares-creative-space/hooks/use-share-links.ts (direct Supabase client +
// RLS owner-write, no global store, no Python API for CRUD). The only gateway call
// is candidate-users (GET) which resolves the directory + email that the client
// cannot read from `profiles`. Actual add/rights/status/remove go straight through
// `supabase.from('collaborations')` (owner-write RLS is the real fence).

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import { getCandidateUsers } from '@/apis/collaboration-api';
import {
  DEFAULT_ACCESS_RIGHTS,
  type AccessRights,
  type CandidateUser,
  type Collaboration,
  type CollabStatus,
} from '../collaboration-space-types';

const log = createLogger('Editor', 'useCollaborators');

/** Postgres unique-violation — UNIQUE(user_id, book_id) survives soft-delete → revive path. */
const PG_UNIQUE_VIOLATION = '23505';

interface UseCollaboratorsReturn {
  collaborators: Collaboration[];
  candidatesMap: Map<string, CandidateUser>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  addCollaborator: (userId: string) => Promise<void>;
  updateRights: (id: string, nextRights: AccessRights) => Promise<void>;
  sendInvite: (id: string) => Promise<void>;
  toggleSuspend: (id: string) => Promise<void>;
  removeCollaborator: (id: string) => Promise<void>;
  reloadCandidates: () => Promise<void>;
}

/** Build a user_id → candidate lookup once per load (shared by sidebar hydrate + add modal). */
function toCandidatesMap(candidates: CandidateUser[]): Map<string, CandidateUser> {
  const map = new Map<string, CandidateUser>();
  for (const c of candidates) map.set(c.user_id, c);
  return map;
}

export function useCollaborators(bookId: string): UseCollaboratorsReturn {
  const [collaborators, setCollaborators] = useState<Collaboration[]>([]);
  const [candidatesMap, setCandidatesMap] = useState<Map<string, CandidateUser>>(new Map());
  // Start `true`: the mount effect kicks off `loadAll` immediately, so the space shows
  // the spinner on first paint instead of a one-frame "No collaborators yet" flash.
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load: candidate directory (email) + live collaborations, in parallel ──────
  // `isActive` guards the state tail so a stale response (bookId changed mid-flight)
  // never overwrites the fresh load. Reused imperatively after mutations (always active).
  const loadAll = useCallback(
    async (isActive: () => boolean = () => true): Promise<void> => {
      log.info('loadAll', 'loading collaborators + candidates', { bookId });
      setIsLoading(true);
      try {
        const [candRes, collabRes] = await Promise.all([
          getCandidateUsers(bookId),
          supabase.from('collaborations').select('*').eq('book_id', bookId).is('deleted_at', null),
        ]);

        if (!isActive()) {
          log.debug('loadAll', 'stale load discarded', { bookId });
          return;
        }

        const nextMap = candRes.success ? toCandidatesMap(candRes.candidates) : new Map<string, CandidateUser>();
        if (candRes.success) {
          log.debug('loadAll', 'candidates loaded', { count: candRes.candidates.length });
        } else {
          log.warn('loadAll', 'candidates failed', { httpStatus: candRes.httpStatus, errorCode: candRes.errorCode });
        }
        setCandidatesMap(nextMap);

        if (collabRes.error) {
          log.error('loadAll', 'collaborations fetch failed', { error: collabRes.error.message, bookId });
          setError(collabRes.error.message);
          setCollaborators([]);
          return;
        }

        const rows = (collabRes.data as Collaboration[]) ?? [];
        const hydrated = rows.map((r) => ({ ...r, profile: nextMap.get(r.user_id) }));
        log.debug('loadAll', 'collaborators loaded', { count: hydrated.length });
        setError(null);
        setCollaborators(hydrated);
      } finally {
        if (isActive()) setIsLoading(false);
      }
    },
    [bookId],
  );

  /** Reload only the candidate directory (refresh `existing_status` after add/remove). */
  const reloadCandidates = useCallback(async (): Promise<void> => {
    log.info('reloadCandidates', 'reloading candidate directory', { bookId });
    const candRes = await getCandidateUsers(bookId);
    if (candRes.success) {
      log.debug('reloadCandidates', 'reloaded', { count: candRes.candidates.length });
      setCandidatesMap(toCandidatesMap(candRes.candidates));
    } else {
      log.warn('reloadCandidates', 'failed', { httpStatus: candRes.httpStatus, errorCode: candRes.errorCode });
    }
  }, [bookId]);

  // Mount / bookId change → load. Deps on the STRING bookId (not an object) so a
  // token refresh does not refire; cancelled flag prevents stale overwrite.
  useEffect(() => {
    if (!bookId) {
      log.debug('effect:load', 'no bookId, skip');
      return;
    }
    let cancelled = false;
    void loadAll(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [bookId, loadAll]);

  // ── Add (revive-safe single path) ────────────────────────────────────────────
  // Try INSERT; on UNIQUE(user_id, book_id) violation (a soft-deleted row still
  // occupies the slot) fall back to a revive UPDATE. Revive resets access_rights
  // to DEFAULT (clean-slate) — the modal presents a soft-deleted user as addable
  // (identical to never-added), so a re-add must not silently reinstate the prior
  // grants (least-privilege by default; matches fresh-add semantics).
  const addCollaborator = useCallback(
    async (userId: string): Promise<void> => {
      log.info('addCollaborator', 'adding collaborator', { userId, bookId });
      setIsSaving(true);
      try {
        const { error: insertError } = await supabase.from('collaborations').insert({
          user_id: userId,
          book_id: bookId,
          status: 0,
          access_rights: DEFAULT_ACCESS_RIGHTS,
        });

        if (insertError) {
          if (insertError.code === PG_UNIQUE_VIOLATION) {
            log.warn('addCollaborator', 'unique violation, reviving soft-deleted row', { userId, bookId });
            const { error: reviveError } = await supabase
              .from('collaborations')
              .update({ deleted_at: null, status: 0, access_rights: DEFAULT_ACCESS_RIGHTS })
              .eq('user_id', userId)
              .eq('book_id', bookId);
            if (reviveError) {
              log.error('addCollaborator', 'revive failed', { error: reviveError.message, userId, bookId });
              setError(reviveError.message);
              toast.error('Failed to add collaborator');
              return;
            }
            log.debug('addCollaborator', 'revived soft-deleted row', { userId });
          } else {
            log.error('addCollaborator', 'insert failed', {
              error: insertError.message,
              code: insertError.code,
              userId,
              bookId,
            });
            setError(insertError.message);
            toast.error('Failed to add collaborator');
            return;
          }
        } else {
          log.debug('addCollaborator', 'inserted', { userId });
        }

        setError(null);
        // Reload collaborators + candidates (existing_status flips for the added user).
        await loadAll();
      } finally {
        setIsSaving(false);
      }
    },
    [bookId, loadAll],
  );

  // ── Rights (optimistic; DB is source of truth on failure) ────────────────────
  const updateRights = useCallback(
    async (id: string, nextRights: AccessRights): Promise<void> => {
      log.info('updateRights', 'updating access rights', { id });
      setCollaborators((prev) => prev.map((c) => (c.id === id ? { ...c, access_rights: nextRights } : c)));
      setIsSaving(true);
      try {
        const { error: updateError } = await supabase
          .from('collaborations')
          .update({ access_rights: nextRights })
          .eq('id', id);
        if (updateError) {
          log.error('updateRights', 'update failed, resyncing from db', { error: updateError.message, id });
          setError(updateError.message);
          toast.error('Failed to save access rights');
          await loadAll(); // authoritative rollback
          return;
        }
        log.debug('updateRights', 'updated', { id });
        setError(null);
      } finally {
        setIsSaving(false);
      }
    },
    [loadAll],
  );

  // ── Status transitions (optimistic local status + persist) ───────────────────
  const persistStatus = useCallback(
    async (id: string, nextStatus: CollabStatus, fn: string): Promise<void> => {
      log.info(fn, 'updating status', { id, nextStatus });
      setCollaborators((prev) => prev.map((c) => (c.id === id ? { ...c, status: nextStatus } : c)));
      setIsSaving(true);
      try {
        const { error: updateError } = await supabase
          .from('collaborations')
          .update({ status: nextStatus })
          .eq('id', id);
        if (updateError) {
          log.error(fn, 'status update failed, resyncing from db', { error: updateError.message, id });
          setError(updateError.message);
          toast.error('Failed to update status');
          await loadAll();
          return;
        }
        log.debug(fn, 'status updated', { id, nextStatus });
        setError(null);
      } finally {
        setIsSaving(false);
      }
    },
    [loadAll],
  );

  /** Send = pending(0) → invited(1). Email defer; client RLS owner-write only. */
  const sendInvite = useCallback((id: string): Promise<void> => persistStatus(id, 1, 'sendInvite'), [persistStatus]);

  /** Suspend/Unsuspend = active(2) ↔ suspended(3). No-op if not in either state. */
  const toggleSuspend = useCallback(
    (id: string): Promise<void> => {
      const current = collaborators.find((c) => c.id === id);
      if (!current) {
        log.warn('toggleSuspend', 'collaborator not found', { id });
        return Promise.resolve();
      }
      if (current.status !== 2 && current.status !== 3) {
        log.warn('toggleSuspend', 'not in active/suspended state', { id, status: current.status });
        return Promise.resolve();
      }
      const next: CollabStatus = current.status === 2 ? 3 : 2;
      log.debug('toggleSuspend', 'toggling suspend', { id, from: current.status, to: next });
      return persistStatus(id, next, 'toggleSuspend');
    },
    [collaborators, persistStatus],
  );

  // ── Remove (soft-delete; optimistic prune + refresh candidates) ──────────────
  const removeCollaborator = useCallback(
    async (id: string): Promise<void> => {
      log.info('removeCollaborator', 'soft-deleting collaborator', { id });
      setCollaborators((prev) => prev.filter((c) => c.id !== id));
      setIsSaving(true);
      try {
        const { error: updateError } = await supabase
          .from('collaborations')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id);
        if (updateError) {
          log.error('removeCollaborator', 'soft-delete failed, resyncing from db', { error: updateError.message, id });
          setError(updateError.message);
          toast.error('Failed to remove collaborator');
          await loadAll();
          return;
        }
        log.debug('removeCollaborator', 'soft-deleted', { id });
        setError(null);
        // Removed user becomes addable again (existing_status → null in the directory).
        await reloadCandidates();
      } finally {
        setIsSaving(false);
      }
    },
    [loadAll, reloadCandidates],
  );

  return {
    collaborators,
    candidatesMap,
    isLoading,
    isSaving,
    error,
    addCollaborator,
    updateRights,
    sendInvite,
    toggleSuspend,
    removeCollaborator,
    reloadCandidates,
  };
}
