// users-page.tsx — Route /users (admin-only, wrapped in <RequireAdmin>).
// Orchestrates header + toolbar + list + create/edit/delete portals. Mirrors
// HumansPage: store selectors + local filter/modal UI state + derived list.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { UsersHeader } from '@/features/users/components/users-header';
import { UsersToolbar } from '@/features/users/components/users-toolbar';
import { UsersList } from '@/features/users/components/users-list';
import { UsersListSkeleton } from '@/features/users/components/users-list-skeleton';
import { UsersErrorState } from '@/features/users/components/users-error-state';
import { CreateUserModal } from '@/features/users/components/create-user-modal';
import { EditUserModal } from '@/features/users/components/edit-user-modal';
import { DeleteUserDialog } from '@/features/users/components/delete-user-dialog';
import { applyFilters } from '@/features/users/utils/apply-filters';
import { DEFAULT_USERS_FILTERS } from '@/features/users/constants';
import { useCurrentProfile } from '@/features/users/hooks/use-current-profile';
import {
  useUsers,
  useUsersActions,
  useUsersError,
  useUsersLoading,
  useUsersMutatingIds,
} from '@/stores/users-store';
import type { ActiveModal, UsersFilterState } from '@/features/users/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Users', 'UsersPage');

export function UsersPage() {
  const users = useUsers();
  const isLoading = useUsersLoading();
  const error = useUsersError();
  const mutatingIds = useUsersMutatingIds();
  const { fetchUsers } = useUsersActions();
  const { userId: currentUserId } = useCurrentProfile();

  const [filters, setFilters] = useState<UsersFilterState>(DEFAULT_USERS_FILTERS);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  useEffect(() => {
    log.info('mount', 'fetching users');
    void fetchUsers();
  }, [fetchUsers]);

  const filtered = useMemo(() => applyFilters(users, filters), [users, filters]);

  const editingUser = useMemo(
    () => (activeModal?.type === 'edit' ? users.find((u) => u.userId === activeModal.userId) : undefined),
    [activeModal, users],
  );
  const deletingUser = useMemo(
    () => (activeModal?.type === 'delete' ? users.find((u) => u.userId === activeModal.userId) : undefined),
    [activeModal, users],
  );

  const handleRetry = useCallback(() => {
    log.info('handleRetry', 'refetching users');
    void fetchUsers();
  }, [fetchUsers]);

  const handleOpenCreate = useCallback(() => setActiveModal({ type: 'create' }), []);
  const handleCloseModal = useCallback(() => setActiveModal(null), []);
  const handleEdit = useCallback((userId: string) => setActiveModal({ type: 'edit', userId }), []);
  const handleDelete = useCallback((userId: string) => setActiveModal({ type: 'delete', userId }), []);

  const handleCreated = useCallback(() => {
    log.info('handleCreated', 'user created');
    toast.success('User created');
    setActiveModal(null);
  }, []);

  const handleSaved = useCallback(() => {
    log.info('handleSaved', 'user updated');
    toast.success('User updated');
    setActiveModal(null);
  }, []);

  const handleDeleted = useCallback(() => {
    log.info('handleDeleted', 'user deleted');
    toast.success('User deleted');
    setActiveModal(null);
  }, []);

  return (
    <main aria-labelledby="users-heading" className="w-full">
      <UsersHeader onOpenCreate={handleOpenCreate} />
      <UsersToolbar filters={filters} count={filtered.length} onChange={setFilters} />

      {isLoading && users.length === 0 ? (
        <UsersListSkeleton />
      ) : error && users.length === 0 ? (
        <UsersErrorState message={error} onRetry={handleRetry} />
      ) : (
        <UsersList
          users={filtered}
          isEmpty={users.length === 0}
          currentUserId={currentUserId}
          mutatingIds={mutatingIds}
          onEdit={(u) => handleEdit(u.userId)}
          onDelete={(u) => handleDelete(u.userId)}
        />
      )}

      {activeModal?.type === 'create' ? (
        <CreateUserModal onClose={handleCloseModal} onCreated={handleCreated} />
      ) : null}

      {activeModal?.type === 'edit' && editingUser ? (
        <EditUserModal user={editingUser} onClose={handleCloseModal} onSaved={handleSaved} />
      ) : null}

      {activeModal?.type === 'delete' && deletingUser ? (
        <DeleteUserDialog user={deletingUser} onClose={handleCloseModal} onDeleted={handleDeleted} />
      ) : null}
    </main>
  );
}
