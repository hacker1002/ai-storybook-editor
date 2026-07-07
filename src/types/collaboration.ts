// Collaboration invite types — shared by the API client (collaboration-api.ts)
// and the post-login invite UI (CollaborationInviteGate / InvitationAcceptModal).
//
// Contract mirrors the FastAPI gateway GET /api/collaboration/invitations
// (ai-storybook-design/api/collaboration/03-list-invitations.md) verbatim.

/**
 * Owner-granted access preview shown read-only in the invite modal. Only the
 * fields the modal renders are typed; the rest of the owner-set config is
 * passed through untouched (never mutated on the invitee side).
 */
export interface AccessRights {
  steps?: Record<string, { enabled?: boolean } | undefined>; // sketch|illustration|retouch...
  languages?: string[]; // e.g. ['en_US','vi_VN']
  [key: string]: unknown; // passthrough owner-set fields
}

export interface InvitationSummary {
  book_id: string;
  book_title: string;
  book_cover: { thumbnail_url: string | null } | null;
  owner_name: string | null;
  owner_avatar: string | null;
  access_rights: AccessRights;
}

export interface ListInvitationsResult {
  success: true;
  invitations: InvitationSummary[];
}

export interface AcceptInvitationResult {
  success: true;
  status: 2;
  book_id: string;
}
