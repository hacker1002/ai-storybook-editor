// swap-parameters-sidebar.tsx — Right sidebar of SwapCropSheetModal (design
// §3.8). ⚡2026-06-12 — PER-TAB parameter group:
//   - Sprites/Crops (group 'swap')  : Swap Model
//   - Remove BG     (group 'rmbg')  : Remove Background Model
//   - Upscale       (group 'upscale'): Upscale Model + Noise stepper
//
// PLACEHOLDER v1 (design §4.6): values are collected in the modal's ephemeral
// local state and NOT forwarded to any API — jobs 05/09/10 take no
// `model_params`; `Noise` semantics are an open question (real-esrgan has no
// noise input). Scale stepper REMOVED — job 10 derives PRINT 300 DPI itself.
// Resets to DEFAULT_SWAP_PARAMS on every modal open.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NumberStepper } from '@/components/ui/number-stepper';
import { createLogger } from '@/utils/logger';
import type { RemixModalTab, SwapModelParams } from '@/types/remix';
import { STAGE_OF_TAB, STAGE_TAB_CONFIG } from './stage-tab-config';
import {
  SWAP_MODEL_OPTIONS,
  RMBG_MODEL_OPTIONS,
  UPSCALE_MODEL_OPTIONS,
  NOISE,
  RIGHT_SIDEBAR_WIDTH_PX,
  HEADER_HEIGHT_PX,
} from './swap-modal-constants';

const log = createLogger('Editor', 'SwapParametersSidebar');

interface SwapParametersSidebarProps {
  params: SwapModelParams;
  onChange: (next: SwapModelParams) => void;
  /** Active modal tab — resolves the visible parameter group (variants →
   *  'swap'; stage tabs → STAGE_TAB_CONFIG paramsGroup). Other groups' values
   *  persist in `params` while hidden (ephemeral, not lost on tab switch). */
  activeTab: RemixModalTab;
}

/** Resolve the parameter group for a tab — variants shares the 'swap' group. */
function paramsGroupOf(activeTab: RemixModalTab): 'swap' | 'rmbg' | 'upscale' {
  if (activeTab === 'variants') return 'swap';
  return STAGE_TAB_CONFIG[STAGE_OF_TAB[activeTab]].paramsGroup;
}

export function SwapParametersSidebar({
  params,
  onChange,
  activeTab,
}: SwapParametersSidebarProps) {
  const group = paramsGroupOf(activeTab);

  const handleSwapModelChange = (value: string) => {
    log.debug('handleSwapModelChange', 'swap model selected', { value });
    onChange({ ...params, swapModel: value });
  };
  const handleRmbgModelChange = (value: string) => {
    log.debug('handleRmbgModelChange', 'rmbg model selected', { value });
    onChange({ ...params, rmbgModel: value });
  };
  const handleUpscaleModelChange = (value: string) => {
    log.debug('handleUpscaleModelChange', 'upscale model selected', { value });
    onChange({ ...params, upscaleModel: value });
  };
  const handleNoiseChange = (value: number) => {
    log.debug('handleNoiseChange', 'noise changed', { value });
    onChange({ ...params, noise: value });
  };

  // Dark field classes: translucent white surface + border-strong + white text
  // via shadcn `Select`'s className API.
  const DARK_TRIGGER_CLASS =
    'w-full bg-[var(--swap-modal-surface-hover)] border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] hover:bg-[var(--swap-modal-surface-hover-strong)] focus-visible:ring-[var(--swap-modal-accent)]';
  const DARK_STEPPER_CLASS =
    '[&_button]:border-[var(--swap-modal-border-strong)] [&_button]:bg-[var(--swap-modal-surface-hover)] [&_button]:text-[var(--swap-modal-text-muted)] [&_button:hover]:bg-[var(--swap-modal-surface-hover-strong)] [&_button:hover]:text-[var(--swap-modal-text-primary)] [&_input]:border-[var(--swap-modal-border-strong)] [&_input]:bg-[var(--swap-modal-surface-hover)] [&_input]:text-[var(--swap-modal-text-primary)]';

  return (
    <aside
      className="flex h-full shrink-0 flex-col border-l border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)]"
      style={{ width: RIGHT_SIDEBAR_WIDTH_PX }}
      aria-label="Tham số swap"
    >
      <div
        className="flex shrink-0 items-center border-b border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)] px-4"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]">
          Parameters
        </p>
      </div>

      <div className="flex flex-col gap-5 overflow-y-auto px-4 py-4">
        {group === 'swap' && (
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
        )}

        {group === 'rmbg' && (
          <ParamField label="Remove Background Model" htmlFor="rmbg-model-select">
            <Select value={params.rmbgModel} onValueChange={handleRmbgModelChange}>
              <SelectTrigger id="rmbg-model-select" className={DARK_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RMBG_MODEL_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ParamField>
        )}

        {group === 'upscale' && (
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

            <ParamField label="Noise">
              {/* Placeholder ephemeral v1 (chốt 2026-06-12): rendered per the
                  mock but NOT sent in the job-10 body — model_params is not
                  part of the contract; Noise semantics are an open question. */}
              <NumberStepper
                value={params.noise}
                min={NOISE.min}
                max={NOISE.max}
                step={NOISE.step}
                onChange={handleNoiseChange}
                className={DARK_STEPPER_CLASS}
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
