// delete-user-dialog.tsx — Confirm soft-delete of a user (revoke access + ban).
// Disabled when the target is the current user (defensive; the row also disables
// self-delete, and the API returns 409 SELF_ACTION_BLOCKED as the authority).

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCurrentProfile } from '@/features/users/hooks/use-current-profile';
import { useUsersActions } from '@/stores/users-store';
import type { SystemUser } from '@/features/users/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Users', 'DeleteUserDialog');

interface DeleteUserDialogProps {
  user: SystemUser;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteUserDialog({ user, onClose, onDeleted }: DeleteUserDialogProps) {
  const { deleteUser } = useUsersActions();
  const { userId: myUserId } = useCurrentProfile();
  const isSelf = user.userId === myUserId;

  const [isDeleting, setIsDeleting] = useState(false);
  const displayName = user.name?.trim() || user.email;

  const handleConfirm = async () => {
    if (isSelf || isDeleting) return;
    log.info('handleConfirm', 'start', { userId: user.userId });
    setIsDeleting(true);

    const ok = await deleteUser(user.userId);

    setIsDeleting(false);
    if (!ok) {
      // Store already surfaced a friendly toast; keep the dialog open.
      log.warn('handleConfirm', 'delete failed; keeping dialog open', { userId: user.userId });
      return;
    }
    log.info('handleConfirm', 'done', { userId: user.userId });
    onDeleted();
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (open || isDeleting) return;
    onClose();
  };

  return (
    <AlertDialog open onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-[460px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user?</AlertDialogTitle>
          <AlertDialogDescription>
            Delete{' '}
            <strong className="font-medium text-foreground">
              &ldquo;{displayName}&rdquo;
            </strong>{' '}
            ({user.email})? Their access is revoked and they can no longer sign in.
            This can be undone by an admin.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isSelf ? (
          <p role="alert" className="text-sm text-destructive">
            You can&apos;t delete your own account.
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isSelf || isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
