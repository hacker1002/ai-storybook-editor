// CollaboratorStatusBadge — pill showing a collaboration's lifecycle status.
// Reused by the sidebar row and the add-collaborator modal row (for already-added
// users). Tone (amber/green/red) + label come from STATUS_META so badge + filter
// labels stay in sync (status 2 = "Active").

import { cn } from '@/utils/utils';
import { STATUS_META, type CollabStatus } from './collaboration-space-types';

/** tone → Tailwind classes (light + dark). */
const TONE_CLASSES: Record<'amber' | 'green' | 'red', string> = {
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
};

interface CollaboratorStatusBadgeProps {
  status: CollabStatus;
  className?: string;
}

export function CollaboratorStatusBadge({ status, className }: CollaboratorStatusBadgeProps) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[meta.tone],
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
