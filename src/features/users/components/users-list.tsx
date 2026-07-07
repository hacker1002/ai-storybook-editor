// users-list.tsx — Renders the filtered UserRow list, or one of two empty states
// (no users at all vs filter matched nothing).

import { Users } from 'lucide-react';
import { UserRow } from '@/features/users/components/user-row';
import type { SystemUser } from '@/features/users/types';

interface UsersListProps {
  users: SystemUser[]; // already filtered
  isEmpty: boolean; // total users (before filtering) === 0
  currentUserId: string | null; // → UserRow.isSelf (disable self-delete)
  mutatingIds: string[]; // userIds with an in-flight update/delete
  onEdit: (user: SystemUser) => void;
  onDelete: (user: SystemUser) => void;
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <Users className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

export function UsersList({
  users,
  isEmpty,
  currentUserId,
  mutatingIds,
  onEdit,
  onDelete,
}: UsersListProps) {
  if (isEmpty) {
    return <EmptyState title="No users yet" hint="Create the first user with “New User”." />;
  }
  if (users.length === 0) {
    return <EmptyState title="No users found" hint="Try adjusting your search or filters." />;
  }

  return (
    <ul role="list" className="divide-y divide-border px-6 py-3">
      {users.map((u) => (
        <li key={u.userId}>
          <UserRow
            user={u}
            isSelf={u.userId === currentUserId}
            isMutating={mutatingIds.includes(u.userId)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </li>
      ))}
    </ul>
  );
}
