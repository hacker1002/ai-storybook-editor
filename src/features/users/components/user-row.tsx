// user-row.tsx — Single user row: avatar · name/email · status + role badges ·
// created date · edit + delete actions. Pure presentational (React.memo).
// Delete is disabled with a tooltip when the row is the current user (isSelf).

import { memo } from 'react';
import { Mail, Pencil, Shield, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { UserBadge } from '@/features/users/components/user-badge';
import { ROLE_META, STATUS_META } from '@/features/users/constants';
import type { SystemUser } from '@/features/users/types';
import { cn } from '@/utils/utils';

interface UserRowProps {
  user: SystemUser;
  isSelf: boolean; // user.userId === currentUserId → disable Delete
  isMutating?: boolean; // in-flight update/delete → disable both actions
  onEdit: (user: SystemUser) => void;
  onDelete: (user: SystemUser) => void;
}

const ACTION_BTN_CLASS =
  'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function formatDate(iso: string): string {
  // createdAt is an ISO string; slice the date portion to avoid any TZ shift.
  return typeof iso === 'string' && iso.length >= 10 ? iso.slice(0, 10) : '—';
}

function UserRowImpl({ user, isSelf, isMutating = false, onEdit, onDelete }: UserRowProps) {
  const displayName = user.name?.trim() || user.email;
  const initial = (user.name?.trim()?.[0] ?? user.email[0] ?? '?').toUpperCase();
  const roleMeta = ROLE_META[user.role];
  const statusMeta = STATUS_META[user.displayStatus];

  return (
    <div className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/60">
      <Avatar className="h-12 w-12 shrink-0 rounded-full">
        {user.avatar ? (
          <AvatarImage src={user.avatar} alt="" loading="lazy" className="rounded-full" />
        ) : null}
        <AvatarFallback className="rounded-full bg-muted">{initial}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
          {user.email}
        </p>
      </div>

      <UserBadge tone={statusMeta.tone} label={statusMeta.label} />
      <UserBadge
        tone={roleMeta.tone}
        label={roleMeta.label}
        icon={<Shield className="h-3 w-3" aria-hidden="true" />}
      />

      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {formatDate(user.createdAt)}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onEdit(user)}
          disabled={isMutating}
          aria-label={`Edit ${displayName}`}
          className={cn(
            ACTION_BTN_CLASS,
            'hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          <Pencil className="h-4 w-4" />
        </button>

        {isSelf ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Wrapper span keeps the tooltip working on a disabled button. */}
                <span className="inline-flex">
                  <button
                    type="button"
                    disabled
                    aria-label={`Delete ${displayName}`}
                    className={cn(ACTION_BTN_CLASS, 'cursor-not-allowed opacity-40')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </TooltipTrigger>
              <TooltipContent>You can&apos;t delete your own account</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <button
            type="button"
            onClick={() => onDelete(user)}
            disabled={isMutating}
            aria-label={`Delete ${displayName}`}
            className={cn(
              ACTION_BTN_CLASS,
              'hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export const UserRow = memo(UserRowImpl);
