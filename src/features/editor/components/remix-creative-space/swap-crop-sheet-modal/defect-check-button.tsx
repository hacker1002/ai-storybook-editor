// defect-check-button.tsx — Generic per-scope "Check" (swap-defect detect)
// button (design 05-15 §4.1). ONE component mounts at BOTH call-sites: the
// sprite row (05-07, sibling Swap) and the batch row `[✓]` slot (05-11 §4, mixes
// only). Plane-agnostic + presentational: it renders a host-computed
// `DetectActionState` (gate/busy/label/badge) and fires `onRun(scopeId)` — the
// host owns plane wiring (auto-select + enqueue). The pure gate (`evaluateDetect`
// + helpers) lives in `tabs/detect-gating.ts` (react-refresh: a component file
// may not also export functions — cf. `sprite-swap-gating.ts`).
//
// SECURITY: never renders/logs `defect.message` — counts/severity only. The
// disabled state is SHOWN (button + tooltip), never hidden.

import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Z_INDEX } from './swap-modal-constants';
import { DEFECT_SEVERITY_STYLE } from './crop-sheet-stage/defect-overlay';
import type { DetectActionState } from './tabs/detect-gating';

const log = createLogger('Editor', 'DefectCheckButton');

// Lift in-modal tooltips above the z-4000 swapModal (shared TooltipContent ships
// at z-50). Mirrors the sprite/batch action tooltips (see Z_INDEX.tooltip).
const TOOLTIP_CONTENT_STYLE = { zIndex: Z_INDEX.tooltip };

export interface DefectCheckButtonProps {
  /** Scope id (sprite_id | batch_id) passed back through `onRun`. */
  scopeId: string;
  /** Display label for a11y/tooltip — "Batch N". */
  scopeLabel: string;
  /** Host-computed gate/busy/label/badge (`evaluateDetect(...)`). */
  detect: DetectActionState;
  /** Click → host auto-selects the scope then enqueues its detect job. */
  onRun: (scopeId: string) => void;
}

/** Icon-only Check button, sibling RIGHT of the row Swap action. Busy → spinner
 *  + `aria-busy`; done & >0 → `●N` severity-colored badge; clean → green tick.
 *  Disabled is SHOWN (greyed + tooltip), never hidden. */
export function DefectCheckButton({
  scopeId,
  scopeLabel,
  detect,
  onRun,
}: DefectCheckButtonProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={-1} className="inline-flex shrink-0">
            <button
              type="button"
              aria-label={`${detect.label} ${scopeLabel}`}
              disabled={detect.disabled || detect.busy}
              aria-busy={detect.busy || undefined}
              onClick={() => {
                log.info('onRunDetect', 'run detect', { scopeId });
                onRun(scopeId);
              }}
              className={cn(
                'relative flex h-6 w-6 items-center justify-center rounded-md border border-[var(--swap-modal-border)] transition-colors hover:bg-[var(--swap-modal-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40',
                detect.badge === 'clean'
                  ? 'text-emerald-400'
                  : 'text-[var(--swap-modal-accent)] hover:text-[var(--swap-modal-accent-hover)]',
              )}
            >
              {detect.busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {detect.badge && detect.badge !== 'clean' && (
                <span
                  aria-hidden="true"
                  className="absolute -right-1 -top-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full px-0.5 text-[9px] font-bold leading-none text-white"
                  style={{
                    backgroundColor: DEFECT_SEVERITY_STYLE[detect.badge.severity].stroke,
                  }}
                >
                  {detect.badge.count > 99 ? '99+' : detect.badge.count}
                </span>
              )}
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-xs text-xs"
          style={TOOLTIP_CONTENT_STYLE}
        >
          {detect.tooltip || detect.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
