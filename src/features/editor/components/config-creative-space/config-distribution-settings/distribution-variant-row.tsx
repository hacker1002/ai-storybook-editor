// distribution-variant-row.tsx — One variant row: is_enabled Checkbox + label +
// file size + status badge + View button. Design §3.3.

import { Eye } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ExportStatusBadge } from './export-status-badge';
import type { ExportStatus } from '@/types/editor';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'DistributionVariantRow');

export interface DistributionVariantRowProps {
  label: string;
  checked: boolean;
  checkboxDisabled: boolean;
  fileSizeText: string;
  status: ExportStatus;
  canView: boolean;
  onToggle: (next: boolean) => void;
  onView: () => void;
}

export function DistributionVariantRow({
  label,
  checked,
  checkboxDisabled,
  fileSizeText,
  status,
  canView,
  onToggle,
  onView,
}: DistributionVariantRowProps) {
  const handleToggle = (next: boolean) => {
    if (checkboxDisabled) return;
    log.debug('handleToggle', 'variant toggled', { label, next });
    onToggle(next);
  };

  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <Checkbox
        checked={checked}
        disabled={checkboxDisabled}
        onCheckedChange={handleToggle}
        aria-label={`Toggle ${label}`}
      />
      <span className="min-w-[88px] font-medium text-foreground">{label}</span>
      <span className="min-w-[64px] text-xs text-muted-foreground">{fileSizeText}</span>
      <div className="flex-1">
        <ExportStatusBadge status={status} />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!canView}
        onClick={onView}
        className="h-7 gap-1 px-2 text-xs"
      >
        <Eye className="h-3.5 w-3.5" />
        View
      </Button>
    </div>
  );
}
