// users-store.ts — Zustand store for the admin Users list + CRUD. Mirrors
// humans-store (zustand + immer + devtools + selector hooks + useShallow actions).
// All I/O goes through usersApi (admin FastAPI). This store is the SINGLE point
// that maps an API failure → a friendly sonner toast (via mapUserErrorMessage).

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { usersApi } from '@/apis/users-api';
import { mapUserErrorMessage } from '@/features/users/constants';
import type {
  CreateUserBody,
  SystemUser,
  UpdateUserPatch,
} from '@/features/users/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Store', 'UsersStore');

interface UsersStore {
  users: SystemUser[];
  isLoading: boolean;
  error: string | null;
  /** userIds with an in-flight update/delete (row-level action disabling). */
  mutatingIds: string[];

  fetchUsers: (includeDeleted?: boolean) => Promise<void>;
  createUser: (input: CreateUserBody) => Promise<SystemUser | null>;
  updateUser: (userId: string, patch: UpdateUserPatch) => Promise<SystemUser | null>;
  deleteUser: (userId: string) => Promise<boolean>;
}

export const useUsersStore = create<UsersStore>()(
  devtools(
    immer((set) => ({
      users: [],
      isLoading: false,
      error: null,
      mutatingIds: [],

      fetchUsers: async (includeDeleted = false) => {
        log.info('fetchUsers', 'start', { includeDeleted });
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        const res = await usersApi.listUsers(includeDeleted);
        if (!res.success) {
          const message = mapUserErrorMessage(res);
          log.error('fetchUsers', 'failed', { httpStatus: res.httpStatus, errorCode: res.errorCode });
          set((state) => {
            state.isLoading = false;
            state.error = message;
          });
          toast.error(message);
          return;
        }

        log.info('fetchUsers', 'done', { count: res.users.length });
        set((state) => {
          state.users = res.users;
          state.isLoading = false;
        });
      },

      createUser: async (input) => {
        log.info('createUser', 'start', { role: input.role });
        const res = await usersApi.createUser(input);
        if (!res.success) {
          log.warn('createUser', 'failed', { httpStatus: res.httpStatus, errorCode: res.errorCode });
          toast.error(mapUserErrorMessage(res));
          return null;
        }

        set((state) => {
          state.users.unshift(res.user);
        });
        log.info('createUser', 'done', { userId: res.user.userId });
        return res.user;
      },

      updateUser: async (userId, patch) => {
        log.info('updateUser', 'start', { userId, fields: Object.keys(patch) });
        set((state) => {
          if (!state.mutatingIds.includes(userId)) state.mutatingIds.push(userId);
        });

        const res = await usersApi.updateUser(userId, patch);

        set((state) => {
          state.mutatingIds = state.mutatingIds.filter((id) => id !== userId);
        });

        if (!res.success) {
          log.warn('updateUser', 'failed', { userId, httpStatus: res.httpStatus, errorCode: res.errorCode });
          toast.error(mapUserErrorMessage(res));
          return null;
        }

        set((state) => {
          const idx = state.users.findIndex((u) => u.userId === userId);
          if (idx >= 0) state.users[idx] = res.user;
        });
        log.info('updateUser', 'done', { userId });
        return res.user;
      },

      deleteUser: async (userId) => {
        log.info('deleteUser', 'start', { userId });
        set((state) => {
          if (!state.mutatingIds.includes(userId)) state.mutatingIds.push(userId);
        });

        const res = await usersApi.deleteUser(userId);

        set((state) => {
          state.mutatingIds = state.mutatingIds.filter((id) => id !== userId);
        });

        if (!res.success) {
          log.warn('deleteUser', 'failed', { userId, httpStatus: res.httpStatus, errorCode: res.errorCode });
          toast.error(mapUserErrorMessage(res));
          return false;
        }

        set((state) => {
          state.users = state.users.filter((u) => u.userId !== userId);
        });
        log.info('deleteUser', 'done', { userId });
        return true;
      },
    })),
    { name: 'users-store' },
  ),
);

export const useUsers = () => useUsersStore((s) => s.users);
export const useUsersLoading = () => useUsersStore((s) => s.isLoading);
export const useUsersError = () => useUsersStore((s) => s.error);
export const useUsersMutatingIds = () => useUsersStore((s) => s.mutatingIds);

// Actions-only hook — pass function REFS through useShallow (never wrap in inline
// arrows, which breaks ref equality → infinite re-render).
export const useUsersActions = () =>
  useUsersStore(
    useShallow((s) => ({
      fetchUsers: s.fetchUsers,
      createUser: s.createUser,
      updateUser: s.updateUser,
      deleteUser: s.deleteUser,
    })),
  );
