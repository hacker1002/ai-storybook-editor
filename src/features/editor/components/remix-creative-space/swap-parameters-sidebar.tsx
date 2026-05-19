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
} from './swap-modal-constants';

const log = createLogger('Editor', 'SwapParametersSidebar');

interface SwapParametersSidebarProps {
  params: SwapModelParams;
  onChange: (next: SwapModelParams) => void;
}

export function SwapParametersSidebar({
  params,
  onChange,
}: SwapParametersSidebarProps) {
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

  return (
    <aside
      className="flex h-full shrink-0 flex-col gap-5 overflow-y-auto border-l border-border bg-background px-4 py-4"
      style={{ width: RIGHT_SIDEBAR_WIDTH_PX }}
      aria-label="Tham số swap"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Parameters
      </p>

      <ParamField label="Swap Model" htmlFor="swap-model-select">
        <Select value={params.swapModel} onValueChange={handleSwapModelChange}>
          <SelectTrigger id="swap-model-select" className="w-full">
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

      <ParamField label="Upscale Model" htmlFor="upscale-model-select">
        <Select
          value={params.upscaleModel}
          onValueChange={handleUpscaleModelChange}
        >
          <SelectTrigger id="upscale-model-select" className="w-full">
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
        <NumberStepper
          value={params.scale}
          min={SCALE.min}
          max={SCALE.max}
          step={SCALE.step}
          onChange={handleScaleChange}
        />
      </ParamField>

      <p className="mt-auto text-[11px] leading-relaxed text-muted-foreground">
        Tham số v1 chỉ thu thập ở UI — chưa nối API.
      </p>
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
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
