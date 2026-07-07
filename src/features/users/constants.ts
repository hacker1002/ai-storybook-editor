// constants.ts — Users feature constants: badge metadata, dropdown options,
// filter defaults, and the single errorCode → friendly-message mapping.

import type { ImageApiFailure } from '@/apis/image-api-client';
import type {
  DisplayStatus,
  SystemRole,
  UsersFilterState,
} from '@/features/users/types';

export const SEARCH_DEBOUNCE_MS = 200;

export const DEFAULT_USERS_FILTERS: UsersFilterState = {
  search: '',
  role: 'all',
  status: 'all',
};

/** Visual tone token consumed by <UserBadge>. */
export type BadgeTone = 'green' | 'amber' | 'red' | 'blue' | 'gray';

/** Role badge metadata (label + tone). admin/editor emphasised, viewer muted. */
export const ROLE_META: Record<SystemRole, { label: string; tone: BadgeTone }> = {
  admin: { label: 'admin', tone: 'blue' },
  editor: { label: 'editor', tone: 'blue' },
  viewer: { label: 'viewer', tone: 'gray' },
};

/** Status badge metadata keyed on displayStatus (README § 1.4). */
export const STATUS_META: Record<DisplayStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'active', tone: 'green' },
  invited: { label: 'invited', tone: 'amber' },
  suspended: { label: 'suspended', tone: 'red' },
};

// --- Dropdown option lists ---------------------------------------------------

/** Role filter (toolbar) — includes the "all" sentinel. */
export const ROLE_FILTER_OPTIONS: ReadonlyArray<{ value: SystemRole | 'all'; label: string }> = [
  { value: 'all', label: 'All roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];

/**
 * Status filter (toolbar) — 4 options because it filters on the DERIVED
 * displayStatus, so 'invited' is a valid filter target.
 */
export const STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: DisplayStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'suspended', label: 'Suspended' },
];

/** Role options for the Create/Edit modals (no "all" sentinel). */
export const ROLE_OPTIONS: ReadonlyArray<{ value: SystemRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];

/**
 * Status options for the EDIT modal — deliberately only 2 (stored values).
 * 'invited' is system-managed/derived and never settable here (README § 1.4).
 */
export const EDIT_STATUS_OPTIONS: ReadonlyArray<{ value: 'active' | 'suspended'; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

export const DEFAULT_NEW_USER_ROLE: SystemRole = 'viewer';

/**
 * Single mapping point: admin-user API failure → friendly, user-facing message.
 * Keyed primarily on `errorCode`, falling back to `httpStatus`. Keep in sync with
 * the backend error envelope (CLAUDE contract): FORBIDDEN, USER_NOT_FOUND,
 * EMAIL_EXISTS, SELF_ACTION_BLOCKED, LAST_ADMIN_BLOCKED, SUPABASE_ADMIN_ERROR.
 */
export function mapUserErrorMessage(failure: ImageApiFailure): string {
  switch (failure.errorCode) {
    case 'VALIDATION_ERROR':
      return 'Please check the form and try again.';
    case 'FORBIDDEN':
      return 'You do not have permission to do that.';
    case 'USER_NOT_FOUND':
      return 'That user no longer exists. The list may be out of date.';
    case 'EMAIL_EXISTS':
      return 'A user with that email already exists.';
    case 'SELF_ACTION_BLOCKED':
      return "You can't perform this action on your own account.";
    case 'LAST_ADMIN_BLOCKED':
      return "You can't remove or suspend the last remaining admin.";
    case 'SUPABASE_ADMIN_ERROR':
      return 'The user service is temporarily unavailable. Please try again.';
    case 'TIMEOUT':
    case 'CONNECTION_ERROR':
      return 'Network problem — please try again.';
    default:
      break;
  }
  if (failure.httpStatus === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  if (failure.httpStatus === 403) {
    return 'You do not have permission to do that.';
  }
  return failure.error || 'Something went wrong. Please try again.';
}
