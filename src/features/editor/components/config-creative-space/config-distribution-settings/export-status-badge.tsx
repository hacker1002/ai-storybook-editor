// export-status-badge.tsx — Status pill for an export variant. `pending` renders
// null (no badge before first export). Tones from STATUS_BADGE. Design §3.4.

import { STATUS_BADGE, type StatusBadgeTone } from '../distribution-helpers';
import type { ExportStatus } from '@/types/editor';
import { cn } from '@/utils/utils';

const TONE_CLASS: Record<StatusBadgeTone['tone'], string> = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-blue-100 text-blue-700',
  red: 'bg-red-100 text-red-700',
};

export interface ExportStatusBadgeProps {
  status: ExportStatus;
}

export function ExportStatusBadge({ status }: ExportStatusBadgeProps) {
  const badge = STATUS_BADGE[status];
  if (!badge) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        TONE_CLASS[badge.tone],
      )}
    >
      {badge.label}
    </span>
  );
}
