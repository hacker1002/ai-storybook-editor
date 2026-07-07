// CollaborationInviteGate — headless, mounted once in AppLayout. When the auth
// session is ready (post-login or restore), it fetches the caller's pending
// invitations once per session and shows InvitationAcceptModal one-at-a-time.
// Accept → POST accept → force-refetch books → toast → advance. Cancel/Esc/
// outside-click → advance (dismiss for this session; invite stays status=1).
//
// React 19 lint safety ([[feedback_react19_set_state_in_effect]]): the check is
// a genuine async side-effect gated on the auth deps — setState runs ONLY on the
// awaited result, never synchronously to "derive" state, and no ref is read in
// render. The auth-keyed deps ([isInitialized, isAuthenticated, userId]) are the
// once-per-session guard; a `cancelled` flag keeps the StrictMode double-invoke
// correct (only one result is applied). Logout hides the modal via the render
// guard; the next login re-runs the effect and overwrites the queue.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getInvitations, acceptInvitation } from '@/apis/collaboration-api';
import { useAuthUser, useIsAuthenticated, useAuthInitialized } from '@/stores/auth-store';
import { useBookActions } from '@/stores/book-store';
import { createLogger } from '@/utils/logger';
import type { InvitationSummary } from '@/types/collaboration';
import { InvitationAcceptModal } from './invitation-accept-modal';
import { mapAcceptError } from './map-accept-error';

const log = createLogger('Collaboration', 'InviteGate');

export function CollaborationInviteGate() {
  const isInitialized = useAuthInitialized();
  const isAuthenticated = useIsAuthenticated();
  const user = useAuthUser();
  const userId = user?.id ?? null;
  const { fetchBooks } = useBookActions();

  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    if (!isInitialized || !isAuthenticated) return;

    log.info('check', 'session ready, fetching invitations', { userId });
    let cancelled = false;
    void (async () => {
      const res = await getInvitations();
      if (cancelled) return;
      if (res.success) {
        setInvitations(res.invitations);
        setActiveIndex(0);
        log.info('check', 'invitations loaded', { count: res.invitations.length });
      } else {
        // Best-effort — never block the app; retry on the next login session.
        log.warn('check', 'list failed, staying silent', {
          httpStatus: res.httpStatus,
          errorCode: res.errorCode,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isInitialized, isAuthenticated, userId]);

  if (!isAuthenticated || activeIndex >= invitations.length) return null;

  const advance = () => setActiveIndex((i) => i + 1);

  const handleAccept = async (bookId: string) => {
    const current = invitations[activeIndex];
    log.info('accept', 'start', { bookId });
    setIsAccepting(true);
    try {
      const res = await acceptInvitation(bookId);
      if (res.success) {
        // force=true bypasses the book-store cache-hit short-circuit so the
        // just-joined book appears in the library immediately.
        await fetchBooks({ force: true });
        toast.success(`Joined "${current.book_title}"`);
        log.info('accept', 'joined', { bookId });
      } else {
        log.warn('accept', 'failed', { bookId, httpStatus: res.httpStatus, errorCode: res.errorCode });
        toast.error(mapAcceptError(res));
      }
    } finally {
      setIsAccepting(false);
      advance();
    }
  };

  return (
    <InvitationAcceptModal
      invitation={invitations[activeIndex]}
      index={activeIndex}
      total={invitations.length}
      isAccepting={isAccepting}
      onAccept={handleAccept}
      onCancel={advance}
    />
  );
}
