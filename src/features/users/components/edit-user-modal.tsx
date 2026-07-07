// edit-user-modal.tsx — Edit a user (name/email/role/status). Status has only 2
// options (Active/Suspended) — 'invited' is derived/system-managed. Self-suspend
// and self-demote (admin → lower) are disabled in the UI; the API 409 is
// authoritative (UI just pre-empts). Sends only changed fields (partial PATCH).

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserFormField } from '@/features/users/components/user-form-field';
import { EDIT_STATUS_OPTIONS, ROLE_OPTIONS } from '@/features/users/constants';
import { useCurrentProfile } from '@/features/users/hooks/use-current-profile';
import { isValidEmail } from '@/features/users/utils/is-valid-email';
import { useUsersActions } from '@/stores/users-store';
import type {
  SystemRole,
  SystemUser,
  UpdateUserPatch,
  UserStatus,
} from '@/features/users/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Users', 'EditUserModal');

interface EditUserModalProps {
  user: SystemUser;
  onClose: () => void;
  onSaved: () => void;
}

export function EditUserModal({ user, onClose, onSaved }: EditUserModalProps) {
  const { updateUser } = useUsersActions();
  const { userId: myUserId } = useCurrentProfile();
  const isSelf = user.userId === myUserId;
  const isSelfAdmin = isSelf && user.role === 'admin';

  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<SystemRole>(user.role);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const emailInvalid = trimmedEmail.length > 0 && !isValidEmail(trimmedEmail);
  const isValid = trimmedName.length > 0 && isValidEmail(trimmedEmail);

  const buildPatch = (): UpdateUserPatch => {
    const patch: UpdateUserPatch = {};
    if (trimmedName !== (user.name ?? '')) patch.name = trimmedName;
    if (trimmedEmail !== user.email) patch.email = trimmedEmail;
    if (role !== user.role) patch.role = role;
    if (status !== user.status) patch.status = status;
    return patch;
  };

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      log.debug('handleSubmit', 'no changes; closing');
      onClose();
      return;
    }
    log.info('handleSubmit', 'start', { userId: user.userId, fields: Object.keys(patch) });
    setError(null);
    setIsSubmitting(true);

    const updated = await updateUser(user.userId, patch);

    setIsSubmitting(false);
    if (!updated) {
      // Store already surfaced a friendly toast; keep the modal open for retry.
      log.warn('handleSubmit', 'update failed; keeping modal open', { userId: user.userId });
      setError('Could not save the changes. Please review and try again.');
      return;
    }
    log.info('handleSubmit', 'done', { userId: user.userId });
    onSaved();
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (open || isSubmitting) return;
    onClose();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <UserFormField label="Full name" htmlFor="edit-user-name" required>
            <Input
              id="edit-user-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              disabled={isSubmitting}
            />
          </UserFormField>

          <UserFormField label="Email" htmlFor="edit-user-email" required>
            <Input
              id="edit-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              aria-invalid={emailInvalid}
              disabled={isSubmitting}
            />
            {emailInvalid ? (
              <p className="text-xs text-destructive">Enter a valid email address.</p>
            ) : null}
          </UserFormField>

          <UserFormField label="Role" htmlFor="edit-user-role">
            <Select value={role} onValueChange={(v) => setRole(v as SystemRole)} disabled={isSubmitting}>
              <SelectTrigger id="edit-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    // Prevent self-demote: an admin editing themselves can't drop below admin.
                    disabled={isSelfAdmin && opt.value !== 'admin'}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </UserFormField>

          <UserFormField label="Status" htmlFor="edit-user-status">
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as UserStatus)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="edit-user-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EDIT_STATUS_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    // Prevent self-suspend (locking yourself out).
                    disabled={isSelf && opt.value === 'suspended'}
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </UserFormField>

          {isSelf ? (
            <p className="text-xs text-muted-foreground">
              You can&apos;t suspend or demote your own account.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="default" onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
