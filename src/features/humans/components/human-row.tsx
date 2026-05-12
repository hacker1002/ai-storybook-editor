// human-row.tsx — Single human row with avatar, name, face count, hover delete, chevron.

import { memo } from 'react';
import { ChevronRight, Trash, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCurrentLocale } from '@/hooks/use-current-locale';
import {
  resolveDisplayName,
  resolveAvatarUrl,
  formatFaceCount,
} from '@/features/humans/utils/display-name-helpers';
import type { Human } from '@/types/human';
import { cn } from '@/utils/utils';

interface HumanRowProps {
  human: Human;
  onOpenDetail: (humanId: string) => void;
  onDelete: (human: Human) => void;
}

function HumanRowImpl({ human, onOpenDetail, onDelete }: HumanRowProps) {
  const locale = useCurrentLocale();
  const displayName = resolveDisplayName(human, locale);
  const avatarUrl = resolveAvatarUrl(human);
  const faceLabel = formatFaceCount(human);
  const initial = displayName.charAt(0).toUpperCase() || '?';

  const handleClick = () => onOpenDetail(human.id);
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(human);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left',
        'transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      aria-label={`Open ${displayName}`}
    >
      <Avatar className="h-12 w-12 shrink-0 rounded-md">
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt="" loading="lazy" className="rounded-md" />
        ) : null}
        <AvatarFallback className="rounded-md bg-muted">{initial}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <User className="h-3 w-3 shrink-0" aria-hidden="true" />
          {faceLabel}
        </p>
      </div>

      <span
        role="button"
        tabIndex={0}
        aria-label={`Delete ${displayName}`}
        onClick={handleDeleteClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onDelete(human);
          }
        }}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground',
          'opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive',
          'group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <Trash className="h-4 w-4" />
      </span>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

export const HumanRow = memo(HumanRowImpl);
