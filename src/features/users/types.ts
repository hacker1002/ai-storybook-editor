// types.ts — Canonical types for the admin Users feature (camelCase mirror of the
// snake_case AdminUser returned by the FastAPI /api/users service). See design
// spec: ai-storybook-design/component/users-page/README.md § 2.1.

/** Role stored on profiles.role. */
export type SystemRole = 'admin' | 'editor' | 'viewer';

/** Status value actually stored on profiles.status. */
export type UserStatus = 'active' | 'suspended';

/**
 * UI badge status — 'invited' is DERIVED by the API (never stored). The client
 * always reads `displayStatus` from the API; it does not derive it locally.
 */
export type DisplayStatus = 'active' | 'invited' | 'suspended';

/** camelCase mirror of the server AdminUser (single mapping point in users-api.ts). */
export interface SystemUser {
  userId: string; // auth.users.id (== profiles.user_id) — identity key
  profileId: string; // profiles.id
  name: string | null; // profiles.name
  email: string; // auth.users.email (admin API join only)
  avatar: string | null; // profiles.avatar
  role: SystemRole; // profiles.role
  status: UserStatus; // profiles.status (stored value)
  displayStatus: DisplayStatus; // API-derived (README § 1.4)
  createdAt: string; // ISO — profiles.created_at
  lastSignInAt: string | null; // auth.users.last_sign_in_at — driver of 'invited'
}

/** Page-level filter state (client-side filtering over a small list). */
export interface UsersFilterState {
  search: string; // matches name + email (case-insensitive)
  role: SystemRole | 'all'; // "All roles"
  status: DisplayStatus | 'all'; // "All statuses" — filters on displayStatus
}

/** Which modal/dialog is currently open (page-owned UI state). */
export type ActiveModal =
  | { type: 'create' }
  | { type: 'edit'; userId: string }
  | { type: 'delete'; userId: string }
  | null;

/** Body for POST /api/users. `temporary_password` kept snake to mirror the API. */
export interface CreateUserBody {
  name: string;
  email: string;
  role?: SystemRole;
  temporary_password?: string;
}

/** Partial patch for PATCH /api/users/{id} (status limited to stored values). */
export interface UpdateUserPatch {
  name?: string;
  email?: string;
  role?: SystemRole;
  status?: UserStatus;
}
