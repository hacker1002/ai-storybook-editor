// use-log-book-login — writes the once-per-session "login" audit row (action_type=1)
// into `collaboration_activity_logs` when the current user opens a book in the editor.
//
// WHY CLIENT-SIDE: per DATABASE-SCHEMA §collaboration_activity_logs + DB-CHANGELOG, the
// writer for login/comment is the CLIENT (direct Supabase INSERT; RLS `WITH CHECK
// actor_user_id = auth.uid() AND (owner OR collaborator)`). CRUD logs come from the
// save-endpoint (service-role). "login" is BOOK-SCOPED here (`book_id NOT NULL`) — it
// means "this user started a working session on this book", not app-level auth.
//
// FIRE-ONCE SEMANTICS: one row per (book, user) per browser SESSION. Dedup via
// sessionStorage so a refresh / HMR / route re-mount within the same tab does NOT append
// duplicate login rows; a new tab/session logs again.
//
// STRICTMODE / RE-MOUNT SAFETY: this is a pure WRITE (no setState), so — unlike the
// read-then-setState gate pattern — we CLAIM the sessionStorage key SYNCHRONOUSLY before
// the await. In StrictMode's mount→unmount→mount the first run claims the key, so the
// second run sees it set and skips → exactly one INSERT. No `cancelled` flag is needed
// (nothing sets React state after the await). On failure we RELEASE the claim so a later
// mount may retry (audit is best-effort by design — client rows are forgeable anyway).

import { useEffect } from 'react';
import { supabase } from '@/apis/supabase';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'useLogBookLogin');

/** action_type=1 (login) — verbatim from DATABASE-SCHEMA §collaboration_activity_logs. */
const ACTION_TYPE_LOGIN = 1;

/**
 * Append a login audit row once per (book, user) per session. No-op until both ids are
 * known. Membership is enforced by RLS (only owner + active collaborators reach the
 * editor), so we do not re-check it here; a rejected insert is a best-effort warn.
 *
 * @param bookId book being opened (null until the route param resolves)
 * @param userId current viewer's id (null until auth resolves)
 */
export function useLogBookLogin(bookId: string | null | undefined, userId: string | null | undefined): void {
  // Deps are the STRING ids (not the user object) so a token refresh does not refire.
  useEffect(() => {
    if (!bookId || !userId) {
      log.debug('effect', 'missing bookId/userId → skip login log', { hasBookId: !!bookId, hasUserId: !!userId });
      return;
    }

    const sessionKey = `collab-login-logged:${bookId}:${userId}`;
    if (sessionStorage.getItem(sessionKey)) {
      log.debug('effect', 'login already logged this session → skip', { bookId });
      return;
    }
    // Claim synchronously BEFORE the await → StrictMode/re-mount cannot double-insert.
    sessionStorage.setItem(sessionKey, '1');

    const writeLoginLog = async (): Promise<void> => {
      log.info('writeLoginLog', 'appending login activity row', { bookId });
      const { error } = await supabase
        .from('collaboration_activity_logs')
        .insert({ book_id: bookId, actor_user_id: userId, action_type: ACTION_TYPE_LOGIN });

      if (error) {
        // Release the claim so a later mount can retry (best-effort audit).
        sessionStorage.removeItem(sessionKey);
        log.warn('writeLoginLog', 'login audit insert failed (best-effort, will retry)', {
          bookId,
          error: error.message,
        });
        return;
      }
      log.debug('writeLoginLog', 'login activity row written', { bookId });
    };

    void writeLoginLog();
  }, [bookId, userId]);
}
