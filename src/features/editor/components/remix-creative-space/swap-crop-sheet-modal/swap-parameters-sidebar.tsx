// swap-parameters-sidebar.tsx — Right sidebar of SwapCropSheetModal (design §3.4).
// Collects AI model parameters: Swap Model, Upscale Model, Scale.
//
// DEFERRED (design §4.4): v1 is COLLECT-ONLY. The values live in the modal's
// ephemeral local state and are NOT forwarded to any API yet — the swap
// endpoint hardcodes its model, and no upscale endpoint exists. Resets to
// DEFAULT_SWAP_PARAMS on every modal open. See plan §unresolved #4.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NumberStepper } from '@/components/ui/number-stepper';
import { createLogger } from '@/utils/logger';
import type { SwapModelParams } from '@/types/remix';
import {
  SWAP_MODEL_OPTIONS,
  UPSCALE_MODEL_OPTIONS,
  SCALE,
  RIGHT_SIDEBAR_WIDTH_PX,
  HEADER_HEIGHT_PX,
} from './swap-modal-constants';

const log = createLogger('Editor', 'SwapParametersSidebar');

interface SwapParametersSidebarProps {
  params: SwapModelParams;
  onChange: (next: SwapModelParams) => void;
  /** Active modal tab. On `variants` (sprite-swap, job 02) only the Swap Model
   *  selector is rendered — Upscale Model + Scale are hidden (job 02 hardcodes
   *  the model and has no upscale step; Validation S1). */
  activeTab?: 'variants' | 'batches' | 'lotties';
}

export function SwapParametersSidebar({
  params,
  onChange,
  activeTab,
}: SwapParametersSidebarProps) {
  // Variants (sprite) tab: model selector only.
  const showUpscaleAndScale = activeTab !== 'variants';
  const handleSwapModelChange = (value: string) => {
    log.debug('handleSwapModelChange', 'swap model selected', { value });
    onChange({ ...params, swapModel: value });
  };

  const handleUpscaleModelChange = (value: string) => {
    log.debug('handleUpscaleModelChange', 'upscale model selected', { value });
    onChange({ ...params, upscaleModel: value });
  };

  const handleScaleChange = (value: number) => {
    log.debug('handleScaleChange', 'scale changed', { value });
    onChange({ ...params, scale: value });
  };

  // Dark field classes (Phase 07): mirror tokens — translucent white surface
  // + border-strong + white text. Applied via shadcn `Select`'s className API
  // (passes through to Radix `Trigger` element). Native `<option>` styling
  // inside `<SelectContent>` is shadcn-controlled — Radix Popover content
  // inherits theme tokens through the parent provider so the dropdown panel
  // renders dark by default (no further override required).
  const DARK_TRIGGER_CLASS =
    'w-full bg-[var(--swap-modal-surface-hover)] border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] hover:bg-[var(--swap-modal-surface-hover-strong)] focus-visible:ring-[var(--swap-modal-accent)]';

  return (
    <aside
      // Dark right sidebar container (Phase 07): surface + border tokens.
      className="flex h-full shrink-0 flex-col border-l border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: RIGHT_SIDEBAR_WIDTH_PX }}
      aria-label="Tham số swap"
    >
      <div
        // Dark header bar (49px) matches StageHeader styling.
        className="flex shrink-0 items-center border-b border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)] px-4"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
          Parameters
        </p>
      </div>

      <div className="flex flex-col gap-5 overflow-y-auto px-4 py-4">

      <ParamField label="Swap Model" htmlFor="swap-model-select">
        <Select value={params.swapModel} onValueChange={handleSwapModelChange}>
          <SelectTrigger id="swap-model-select" className={DARK_TRIGGER_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SWAP_MODEL_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ParamField>

      {showUpscaleAndScale && (
        <>
          <ParamField label="Upscale Model" htmlFor="upscale-model-select">
            <Select
              value={params.upscaleModel}
              onValueChange={handleUpscaleModelChange}
            >
              <SelectTrigger
                id="upscale-model-select"
                className={DARK_TRIGGER_CLASS}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UPSCALE_MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ParamField>

          <ParamField label="Scale">
            {/* Dark stepper override: NumberStepper is a shared component using
                light-theme tokens; scoped descendant overrides paint it dark
                inside this modal only. */}
            <NumberStepper
              value={params.scale}
              min={SCALE.min}
              max={SCALE.max}
              step={SCALE.step}
              onChange={handleScaleChange}
              className="[&_button]:border-[var(--swap-modal-border-strong)] [&_button]:bg-[var(--swap-modal-surface-hover)] [&_button]:text-[var(--swap-modal-text-muted)] [&_button:hover]:bg-[var(--swap-modal-surface-hover-strong)] [&_button:hover]:text-[var(--swap-modal-text-primary)] [&_input]:border-[var(--swap-modal-border-strong)] [&_input]:bg-[var(--swap-modal-surface-hover)] [&_input]:text-[var(--swap-modal-text-primary)]"
            />
          </ParamField>
        </>
      )}

        <p className="mt-auto text-[11px] leading-relaxed text-[var(--swap-modal-text-muted)]">
          Tham số v1 chỉ thu thập ở UI — chưa nối API.
        </p>
      </div>
    </aside>
  );
}

interface ParamFieldProps {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}

function ParamField({ label, htmlFor, children }: ParamFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-wide text-[var(--swap-modal-text-muted)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
