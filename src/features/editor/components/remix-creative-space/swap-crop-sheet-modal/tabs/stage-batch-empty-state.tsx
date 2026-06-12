// stage-batch-empty-state.tsx — Center-stage CTA for the allowZeroBatch stages
// (Remove BG / Upscale) when the stage has 0 batches (design 05-11 §4.2).
// The CTA opens the ImportBatchModal (same handler as the header Import
// button); it is disabled while the previous stage has no finals yet.

import { Download } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const log = createLogger('Editor', 'StageBatchEmptyState');

interface StageBatchEmptyStateProps {
  /** Stage label for the headline (Remove BG | Upscale). */
  stageLabel: string;
  /** Disabled while the previous stage has no finals (tooltip explains). */
  disabled: boolean;
  /** Tooltip shown when disabled — EN per design. */
  disabledTooltip: string;
  onImport: () => void;
}

export function StageBatchEmptyState({
  stageLabel,
  disabled,
  disabledTooltip,
  onImport,
}: StageBatchEmptyStateProps) {
  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        log.debug('onImport', 'empty-state CTA clicked', { stageLabel });
        onImport();
      }}
      className="flex items-center gap-1.5 rounded-md bg-[var(--swap-modal-accent)] px-3 py-1.5 text-sm font-medium text-[var(--swap-modal-bg)] transition-colors hover:bg-[var(--swap-modal-accent-hover)] disabled:pointer-events-none disabled:opacity-40"
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      Import from previous stage
    </button>
  );

  return (
    <section
      className="flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-[var(--swap-modal-bg)] p-8 text-center"
      aria-label={`${stageLabel} stage`}
    >
      <p className="text-sm font-medium text-[var(--swap-modal-text-secondary)]">
        No batches yet.
      </p>
      <p className="text-xs text-[var(--swap-modal-text-muted)]">
        Import finals from the previous stage to build the first batch.
      </p>
      {disabled ? (
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
      ) : (
        button
      )}
    </section>
  );
}
