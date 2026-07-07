// users-api.ts — Thin wrappers over the FastAPI admin Users endpoints.
//   listUsers()   → GET    /api/users
//   createUser()  → POST   /api/users
//   updateUser()  → PATCH  /api/users/{user_id}
//   deleteUser()  → DELETE /api/users/{user_id}
// All reuse image-api-client auth (X-API-Key + Bearer). This module is the SINGLE
// point where the snake_case server AdminUser is mapped → camelCase SystemUser.
// Callers check `!success` and narrow to ImageApiFailure for httpStatus/errorCode.

import {
  callImageApi,
  callImageApiDelete,
  callImageApiGet,
  callImageApiPatch,
  type ImageApiFailure,
} from './image-api-client';
import type {
  CreateUserBody,
  SystemUser,
  UpdateUserPatch,
} from '@/features/users/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('API', 'UsersApi');

// --- Raw (snake_case) server shapes -----------------------------------------

interface AdminUserResponse {
  user_id: string;
  profile_id: string;
  name: string | null;
  email: string;
  avatar: string | null;
  role: SystemUser['role'];
  status: SystemUser['status'];
  display_status: SystemUser['displayStatus'];
  created_at: string;
  last_sign_in_at: string | null;
}

// NOTE: `success: true` (literal, not boolean) so the `R | ImageApiFailure`
// union the client returns discriminates cleanly — `if (!res.success)` narrows
// to ImageApiFailure. These describe ONLY the success payload; the client
// synthesises ImageApiFailure (success: false) on any non-2xx / network error.
interface RawListUsersResponse {
  success: true;
  error?: string;
  users: AdminUserResponse[];
  total: number;
}

interface RawCreateUserResponse {
  success: true;
  error?: string;
  user: AdminUserResponse;
  invited: boolean;
}

interface RawUpdateUserResponse {
  success: true;
  error?: string;
  user: AdminUserResponse;
}

interface RawDeleteUserResponse {
  success: true;
  error?: string;
  user_id: string;
  deleted_at: string;
}

// --- Public (camelCase) result shapes ---------------------------------------

export interface ListUsersResult {
  success: true;
  users: SystemUser[];
  total: number;
}

export interface CreateUserResult {
  success: true;
  user: SystemUser;
  invited: boolean;
}

export interface UpdateUserResult {
  success: true;
  user: SystemUser;
}

export interface DeleteUserResult {
  success: true;
  userId: string;
  deletedAt: string;
}

/** The one snake_case → camelCase adapter for admin users. */
function mapAdminUser(raw: AdminUserResponse): SystemUser {
  return {
    userId: raw.user_id,
    profileId: raw.profile_id,
    name: raw.name,
    email: raw.email,
    avatar: raw.avatar,
    role: raw.role,
    status: raw.status,
    displayStatus: raw.display_status,
    createdAt: raw.created_at,
    lastSignInAt: raw.last_sign_in_at,
  };
}

export const usersApi = {
  /** List all system users. `includeDeleted` surfaces soft-deleted rows too. */
  async listUsers(includeDeleted = false): Promise<ListUsersResult | ImageApiFailure> {
    log.info('listUsers', 'request', { includeDeleted });
    const path = `/api/users${includeDeleted ? '?include_deleted=true' : ''}`;
    const res = await callImageApiGet<RawListUsersResponse>(path);
    if (!res.success) {
      log.warn('listUsers', 'failed', { httpStatus: res.httpStatus, errorCode: res.errorCode });
      return res;
    }
    const users = (res.users ?? []).map(mapAdminUser);
    log.debug('listUsers', 'ok', { count: users.length, total: res.total });
    return { success: true, users, total: res.total };
  },

  /** Create a user (temp-password path). Do NOT log the password. */
  async createUser(body: CreateUserBody): Promise<CreateUserResult | ImageApiFailure> {
    log.info('createUser', 'request', {
      role: body.role,
      hasTempPassword: Boolean(body.temporary_password),
    });
    const res = await callImageApi<RawCreateUserResponse>('/api/users', body);
    if (!res.success) {
      log.warn('createUser', 'failed', { httpStatus: res.httpStatus, errorCode: res.errorCode });
      return res;
    }
    log.info('createUser', 'ok', { userId: res.user.user_id, invited: res.invited });
    return { success: true, user: mapAdminUser(res.user), invited: res.invited };
  },

  /** Partial update of a user. Sends only changed fields (page/modal computes diff). */
  async updateUser(
    userId: string,
    patch: UpdateUserPatch,
  ): Promise<UpdateUserResult | ImageApiFailure> {
    log.info('updateUser', 'request', { userId, fields: Object.keys(patch) });
    const res = await callImageApiPatch<RawUpdateUserResponse>(
      `/api/users/${encodeURIComponent(userId)}`,
      patch,
    );
    if (!res.success) {
      log.warn('updateUser', 'failed', { userId, httpStatus: res.httpStatus, errorCode: res.errorCode });
      return res;
    }
    log.info('updateUser', 'ok', { userId });
    return { success: true, user: mapAdminUser(res.user) };
  },

  /** Soft-delete + ban a user. No request body. */
  async deleteUser(userId: string): Promise<DeleteUserResult | ImageApiFailure> {
    log.info('deleteUser', 'request', { userId });
    const res = await callImageApiDelete<RawDeleteUserResponse>(
      `/api/users/${encodeURIComponent(userId)}`,
    );
    if (!res.success) {
      log.warn('deleteUser', 'failed', { userId, httpStatus: res.httpStatus, errorCode: res.errorCode });
      return res;
    }
    log.info('deleteUser', 'ok', { userId });
    return { success: true, userId: res.user_id, deletedAt: res.deleted_at };
  },
};
