// stage-import-button.tsx — Stage-header `Import` button shared by the Remove
// BG / Upscale tab instances (design 05-12/05-13 — opens the ImportBatchModal;
// disabled with a tooltip while the previous stage has no finals).

import { Download } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const log = createLogger('Editor', 'StageImportButton');

interface StageImportButtonProps {
  disabled: boolean;
  /** Tooltip when disabled (EN per design); empty → no tooltip wrapper. */
  disabledTooltip: string;
  onOpenImport: () => void;
}

export function StageImportButton({
  disabled,
  disabledTooltip,
  onOpenImport,
}: StageImportButtonProps) {
  const button = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => {
        log.debug('onClick', 'open import dialog', {});
        onOpenImport();
      }}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors',
        'border-[var(--swap-modal-border)] text-[var(--swap-modal-text-muted)]',
        'hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)]',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Import
    </button>
  );

  if (!disabled || !disabledTooltip) return button;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          {disabledTooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
