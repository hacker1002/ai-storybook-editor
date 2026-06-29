// swap-parameters-sidebar.tsx — Right sidebar of SwapCropSheetModal (design
// §3.8). ⚡2026-06-12 — PER-TAB parameter group:
//   - Sprites/Crops (group 'swap')  : Swap Model + Temperature (shared stepper)
//   - Remove BG     (group 'rmbg')  : Remove Background Model
//   - Upscale       (group 'upscale'): Upscale Model + Noise stepper
//
// ⚡2026-06-13 WIRED (design §4.6): values forward via buildModelParams(stage,
// params) → job body `model_params`; the API allowlists/clamps/maps per model.
// Noise is disabled + tooltipped when the picked upscale model has no denoise
// input (modelSupportsNoise — real-esrgan / recraft ignore it; the value stays
// in `params` and the backend drops the key as defense). Scale stepper REMOVED
// — job 10 derives PRINT 300 DPI itself. Params are ephemeral — reset to
// DEFAULT_SWAP_PARAMS on every modal open.

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NumberStepper } from '@/components/ui/number-stepper';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { createLogger } from '@/utils/logger';
import type { RemixModalTab, SwapModelParams } from '@/types/remix';
import { STAGE_OF_TAB, STAGE_TAB_CONFIG } from './stage-tab-config';
import {
  SWAP_MODEL_OPTIONS,
  RMBG_MODEL_OPTIONS,
  UPSCALE_MODEL_OPTIONS,
  NOISE,
  GRAIN,
  TEMPERATURE,
  modelSupportsNoise,
  RIGHT_SIDEBAR_WIDTH_PX,
  HEADER_HEIGHT_PX,
  Z_INDEX,
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
  // Noise input is meaningless for models without a denoise knob (real-esrgan /
  // recraft); disable + tooltip. Value stays in params — backend drops the key.
  const noiseDisabled = !modelSupportsNoise(params.upscaleModel);
  // ⚡2026-06-29 Grain is MODEL-AGNOSTIC — the toggle is NEVER gated by the
  // picked model (unlike Noise). amp/blur grey out only when the toggle is off;
  // pure derive (NO useEffect+setState — React 19 lints that as an error).
  const grainKnobsDisabled = !params.grainEnabled;

  const handleSwapModelChange = (value: string) => {
    log.debug('handleSwapModelChange', 'swap model selected', { value });
    onChange({ ...params, swapModel: value });
  };
  const handleTemperatureChange = (value: number) => {
    log.debug('handleTemperatureChange', 'temperature changed', { value });
    onChange({ ...params, swapTemperature: value });
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
  const handleGrainToggle = (checked: boolean) => {
    log.debug('handleGrainToggle', 'grain toggled', { enabled: checked });
    onChange({ ...params, grainEnabled: checked });
  };
  const handleGrainAmpChange = (value: number) => {
    log.debug('handleGrainAmpChange', 'grain amp changed', { value });
    onChange({ ...params, grainAmp: value });
  };
  const handleGrainBlurChange = (value: number) => {
    log.debug('handleGrainBlurChange', 'grain blur changed', { value });
    onChange({ ...params, grainBlur: value });
  };

  // Dark field classes: translucent white surface + border-strong + white text
  // via shadcn `Select`'s className API.
  const DARK_TRIGGER_CLASS =
    'w-full bg-[var(--swap-modal-surface-hover)] border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] hover:bg-[var(--swap-modal-surface-hover-strong)] focus-visible:ring-[var(--swap-modal-accent)]';
  const DARK_STEPPER_CLASS =
    '[&_button]:border-[var(--swap-modal-border-strong)] [&_button]:bg-[var(--swap-modal-surface-hover)] [&_button]:text-[var(--swap-modal-text-muted)] [&_button:hover]:bg-[var(--swap-modal-surface-hover-strong)] [&_button:hover]:text-[var(--swap-modal-text-primary)] [&_input]:border-[var(--swap-modal-border-strong)] [&_input]:bg-[var(--swap-modal-surface-hover)] [&_input]:text-[var(--swap-modal-text-primary)]';
  // Radix popper copies this computed z-index onto its portal wrapper; without
  // it the dropdown (shadcn default z-50) paints behind the swapModal (z-4000).
  const SELECT_CONTENT_STYLE = { zIndex: Z_INDEX.selectDropdown };

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
          <>
            <ParamField label="Swap Model" htmlFor="swap-model-select">
              <Select value={params.swapModel} onValueChange={handleSwapModelChange}>
                <SelectTrigger id="swap-model-select" className={DARK_TRIGGER_CLASS}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={SELECT_CONTENT_STYLE}>
                  {SWAP_MODEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ParamField>

            <ParamField label="Temperature">
              <NumberStepper
                value={params.swapTemperature}
                min={TEMPERATURE.min}
                max={TEMPERATURE.max}
                step={TEMPERATURE.step}
                onChange={handleTemperatureChange}
                className={DARK_STEPPER_CLASS}
              />
            </ParamField>
          </>
        )}

        {group === 'rmbg' && (
          <ParamField label="Remove Background Model" htmlFor="rmbg-model-select">
            <Select value={params.rmbgModel} onValueChange={handleRmbgModelChange}>
              <SelectTrigger id="rmbg-model-select" className={DARK_TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={SELECT_CONTENT_STYLE}>
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
                <SelectContent style={SELECT_CONTENT_STYLE}>
                  {UPSCALE_MODEL_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </ParamField>

            <ParamField label="Noise">
              {/* ⚡2026-06-13 WIRED → model_params.params.noise. Disabled +
                  tooltip when the model has no denoise input; the span wrapper
                  gives the Tooltip a hover target (a disabled control emits no
                  pointer events). */}
              {noiseDisabled ? (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex w-fit">
                        <NumberStepper
                          value={params.noise}
                          min={NOISE.min}
                          max={NOISE.max}
                          step={NOISE.step}
                          onChange={handleNoiseChange}
                          disabled
                          className={DARK_STEPPER_CLASS}
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Not used by this model</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <NumberStepper
                  value={params.noise}
                  min={NOISE.min}
                  max={NOISE.max}
                  step={NOISE.step}
                  onChange={handleNoiseChange}
                  className={DARK_STEPPER_CLASS}
                />
              )}
            </ParamField>

            {/* ⚡2026-06-29 Watercolor grain post-process → TOP-LEVEL job-10 body
                `grain` (sibling of model_params). MODEL-AGNOSTIC: the toggle is
                NEVER gated by the picked model (unlike Noise above) — it stays
                enabled on all 4 upscale models incl. the xinntao default. Only
                amp/blur grey out when the toggle is off (pure derive). */}
            <div className="flex items-center justify-between">
              <label
                htmlFor="grain-toggle"
                className="text-xs font-medium uppercase tracking-wide text-[var(--swap-modal-text-muted)]"
              >
                Grain
              </label>
              <Switch
                id="grain-toggle"
                checked={params.grainEnabled}
                onCheckedChange={handleGrainToggle}
                className="data-[state=checked]:bg-[var(--swap-modal-accent)]"
              />
            </div>

            <ParamField label="Grain Amp">
              <NumberStepper
                value={params.grainAmp}
                min={GRAIN.amp.min}
                max={GRAIN.amp.max}
                step={GRAIN.amp.step}
                onChange={handleGrainAmpChange}
                disabled={grainKnobsDisabled}
                className={DARK_STEPPER_CLASS}
              />
            </ParamField>

            <ParamField label="Grain Blur">
              <NumberStepper
                value={params.grainBlur}
                min={GRAIN.blur.min}
                max={GRAIN.blur.max}
                step={GRAIN.blur.step}
                onChange={handleGrainBlurChange}
                disabled={grainKnobsDisabled}
                className={DARK_STEPPER_CLASS}
              />
            </ParamField>
          </>
        )}

        <p className="mt-auto text-[11px] leading-relaxed text-[var(--swap-modal-text-muted)]">
          Tham số gửi kèm mỗi job; reset mặc định mỗi lần mở modal.
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
