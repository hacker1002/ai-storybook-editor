// create-user-modal.tsx — Create a new user via the admin API. Temp-password only
// (no invite toggle): a strong password is auto-generated on open, editable, and
// regenerable. On success the caller toasts — the password is NOT shown again.

import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
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
import { DEFAULT_NEW_USER_ROLE, ROLE_OPTIONS } from '@/features/users/constants';
import { generatePassword } from '@/features/users/utils/generate-password';
import { isValidEmail } from '@/features/users/utils/is-valid-email';
import { useUsersActions } from '@/stores/users-store';
import type { SystemRole, SystemUser } from '@/features/users/types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Users', 'CreateUserModal');

const MIN_PASSWORD_LEN = 8;

interface CreateUserModalProps {
  onClose: () => void;
  onCreated: (user: SystemUser) => void;
}

export function CreateUserModal({ onClose, onCreated }: CreateUserModalProps) {
  const { createUser } = useUsersActions();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SystemRole>(DEFAULT_NEW_USER_ROLE);
  const [password, setPassword] = useState(() => generatePassword());
  const [showPassword, setShowPassword] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const emailInvalid = trimmedEmail.length > 0 && !isValidEmail(trimmedEmail);
  const isValid =
    trimmedName.length > 0 &&
    isValidEmail(trimmedEmail) &&
    password.length >= MIN_PASSWORD_LEN;

  const handleRegenerate = () => {
    log.debug('handleRegenerate', 'regenerating temp password');
    setPassword(generatePassword());
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (insecure context / denied) — admin can still
      // select the visible field manually.
      log.warn('handleCopy', 'clipboard write unavailable');
    }
  };

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;
    log.info('handleSubmit', 'start', { role });
    setError(null);
    setIsSubmitting(true);

    const user = await createUser({
      name: trimmedName,
      email: trimmedEmail,
      role,
      temporary_password: password,
    });

    setIsSubmitting(false);
    if (!user) {
      // Store already surfaced a friendly toast; keep the modal open for retry.
      log.warn('handleSubmit', 'create failed; keeping modal open');
      setError('Could not create the user. Please review and try again.');
      return;
    }
    log.info('handleSubmit', 'done', { userId: user.userId });
    onCreated(user);
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
          <DialogTitle>Create New User</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <UserFormField label="Full name" htmlFor="create-user-name" required>
            <Input
              id="create-user-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              disabled={isSubmitting}
            />
          </UserFormField>

          <UserFormField label="Email" htmlFor="create-user-email" required>
            <Input
              id="create-user-email"
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

          <UserFormField label="Temporary password" htmlFor="create-user-password" required>
            <div className="flex items-center gap-2">
              <Input
                id="create-user-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={MIN_PASSWORD_LEN}
                disabled={isSubmitting}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPassword((v) => !v)}
                disabled={isSubmitting}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                disabled={isSubmitting}
                aria-label={copied ? 'Password copied' : 'Copy password'}
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleRegenerate}
                disabled={isSubmitting}
                aria-label="Generate a new password"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Copy and share this with the user before you create the account — it
              won&apos;t be shown again.
            </p>
          </UserFormField>

          <UserFormField label="Role" htmlFor="create-user-role">
            <Select value={role} onValueChange={(v) => setRole(v as SystemRole)} disabled={isSubmitting}>
              <SelectTrigger id="create-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </UserFormField>

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
            {isSubmitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
