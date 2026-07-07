// Collaboration invite API — thin wrappers over the FastAPI gateway.
//   getInvitations()  → GET  /api/collaboration/invitations  (JWT-gated list)
//   acceptInvitation()→ POST /api/collaboration/accept        (status 1→2)
// Both reuse image-api-client auth (X-API-Key + Bearer). Callers check
// `!success` and narrow to ImageApiFailure for httpStatus/errorCode mapping.

import { callImageApi, callImageApiGet, type ImageApiFailure } from './image-api-client';
import type { ListInvitationsResult, AcceptInvitationResult } from '@/types/collaboration';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'CollaborationApi');

/** Fetch the caller's pending invitations (empty list is a success). */
export async function getInvitations(): Promise<ListInvitationsResult | ImageApiFailure> {
  log.info('getInvitations', 'request');
  const res = await callImageApiGet<ListInvitationsResult>('/api/collaboration/invitations');
  if (res.success) {
    log.debug('getInvitations', 'ok', { count: res.invitations.length });
  } else {
    log.warn('getInvitations', 'failed', { httpStatus: res.httpStatus, errorCode: res.errorCode });
  }
  return res;
}

/** Accept an invitation for `bookId` (idempotent when already active). */
export async function acceptInvitation(
  bookId: string
): Promise<AcceptInvitationResult | ImageApiFailure> {
  log.info('acceptInvitation', 'request', { bookId });
  const res = await callImageApi<AcceptInvitationResult>('/api/collaboration/accept', {
    book_id: bookId,
  });
  if (res.success) {
    log.info('acceptInvitation', 'accepted', { bookId, status: res.status });
  } else {
    log.warn('acceptInvitation', 'failed', { bookId, httpStatus: res.httpStatus, errorCode: res.errorCode });
  }
  return res;
}
