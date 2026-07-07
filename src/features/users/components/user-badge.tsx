// user-badge.tsx — Small tone-based pill used for BOTH the role and status
// badges in UserRow (reused ≥2 places). Colour + text (WCAG: never colour-only).

import type { ReactNode } from 'react';
import type { BadgeTone } from '@/features/users/constants';
import { cn } from '@/utils/utils';

const TONE_CLASS: Record<BadgeTone, string> = {
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  red: 'bg-red-500/15 text-red-700 dark:text-red-400',
  blue: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  gray: 'bg-muted text-muted-foreground',
};

interface UserBadgeProps {
  tone: BadgeTone;
  label: string;
  icon?: ReactNode;
  className?: string;
}

export function UserBadge({ tone, label, icon, className }: UserBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      {label}
    </span>
  );
}
