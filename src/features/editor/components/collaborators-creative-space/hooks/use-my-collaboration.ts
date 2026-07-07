// use-my-collaboration — viewer-scoped read of the CURRENT user's OWN collaboration
// row, used ONLY to drive collaboration-mode UI gating (grey-out ungranted icon-rail
// items + editor-header step links when the viewer is not the book owner).
//
// SECURITY: this is a UX gate ONLY (prevents dead-ends). It is NOT a security
// boundary. The real fence is RLS (`is_book_collaborator` gate on status=2) plus a
// future authorization gateway on writes — never this client-derived value.
//
// RLS: a collaborator may read only its OWN row (`user_id = auth.uid()`), so no other
// user's access_rights ever leaks through here.

import { useState, useEffect } from 'react';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';
import type { AccessRights } from '../collaboration-space-types';

const log = createLogger('Editor', 'useMyCollaboration');

interface UseMyCollaborationReturn {
  /** Viewer's own access matrix, or null (owner → never gated, OR non-owner with no
   *  active row / pending fetch → caller reads null as "disable all defensively"). */
  access_rights: AccessRights | null;
}

/**
 * Owner is never gated → the fetch is SKIPPED entirely when `isOwner` is true.
 * For a non-owner, fetches the single active collaboration row and returns its
 * `access_rights`. Missing row / fetch error → null (caller disables everything).
 *
 * @param bookId  book being viewed (null/undefined → no fetch)
 * @param userId  the current viewer's id (null/undefined → no fetch)
 * @param isOwner true when the viewer owns the book (skip fetch, never gate)
 */
export function useMyCollaboration(
  bookId: string | null | undefined,
  userId: string | null | undefined,
  isOwner: boolean,
): UseMyCollaborationReturn {
  // Holds the last fetched rights TAGGED with the (bookId,userId) they belong to, so
  // the derived value below can discard a stale result on a book/user switch WITHOUT
  // a synchronous setState-in-effect (forbidden by this repo's react-hooks rule).
  // Only the async fetch writes state.
  const [fetched, setFetched] = useState<{ key: string; rights: AccessRights | null } | null>(null);

  // Effect deps are the STRING bookId/userId (+ isOwner), not objects, so a token
  // refresh does not refire; the cancelled flag prevents a stale overwrite.
  useEffect(() => {
    // Owner never gated + missing ids → no fetch. Reset is handled by the render-time
    // derivation (key mismatch below), NOT by setState here (set-state-in-effect).
    if (isOwner) {
      log.debug('effect', 'viewer is owner → skip fetch (gating disabled)', { bookId });
      return;
    }
    if (!bookId || !userId) {
      log.debug('effect', 'missing bookId/userId → skip fetch', { hasBookId: !!bookId, hasUserId: !!userId });
      return;
    }

    let cancelled = false;
    const key = `${bookId}::${userId}`;

    const load = async (): Promise<void> => {
      log.info('load', 'fetching viewer collaboration row', { bookId });
      const { data, error } = await supabase
        .from('collaborations')
        .select('access_rights')
        .eq('book_id', bookId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();

      if (cancelled) {
        log.debug('load', 'stale load discarded', { bookId });
        return;
      }
      if (error) {
        log.error('load', 'collaboration fetch failed → gate defensively (disable all)', {
          error: error.message,
          bookId,
        });
        setFetched({ key, rights: null });
        return;
      }
      if (!data) {
        // Non-owner with no active collaboration row (edge — RLS should gate book
        // entry). Caller treats null-for-non-owner as "disable all defensively".
        log.warn('load', 'no active collaboration row for viewer → gate defensively (disable all)', { bookId });
        setFetched({ key, rights: null });
        return;
      }

      log.debug('load', 'collaboration rights loaded', { bookId });
      setFetched({ key, rights: (data.access_rights as AccessRights) ?? null });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [bookId, userId, isOwner]);

  // Derive (never setState here): owner → null (never gated). Non-owner → the fetched
  // rights ONLY if they belong to the current (bookId,userId); otherwise null, which
  // the caller reads as "disable all defensively" until the fetch for this key lands.
  const access_rights: AccessRights | null =
    isOwner || !bookId || !userId
      ? null
      : fetched && fetched.key === `${bookId}::${userId}`
        ? fetched.rights
        : null;

  return { access_rights };
}
