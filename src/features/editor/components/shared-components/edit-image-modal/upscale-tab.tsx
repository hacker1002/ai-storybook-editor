// upscale-tab.tsx — Upscale tab (design 03-upscale-tab.md): AI super-resolution of the
// selected version (Replicate, sync). The hook owns model + scale + faceEnhance params; it
// returns a Handle (ParamsPanel + canCommit + commit) the shell consumes — mirror of
// useRemoveBgTabState (same `preview` contract, no paint). commit → callImageUpscale → a
// permanent Storage URL; the shell prepends it as a new `type='edited'` version.
//
// Per-model gating (UPSCALE_MODEL_CAPS): recraft is fixed-ratio native passthrough → Scale AND
// Face Enhance are disabled (changing them is a no-op upstream). Switching model keeps the
// scale/faceEnhance state — only the disabled flag changes (03 §4).

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { NumberStepper } from '@/components/ui/number-stepper';
import { createLogger } from '@/utils/logger';
import { callImageUpscale } from '@/apis/image-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
import type { Illustration } from '@/types/prop-types';
import {
  UPSCALE_MODEL_OPTIONS,
  DEFAULT_UPSCALE_MODEL,
  UPSCALE_MODEL_CAPS,
  SCALE,
  DEFAULT_FACE_ENHANCE,
  SWAP_MODAL_OUTLINE_BUTTON_CLASS,
  Z_INDEX,
  type UpscaleModel,
} from './edit-image-modal-constants';
import { EditApiError, buildUpscalePayload } from './edit-image-modal-utils';

const log = createLogger('Editor', 'UpscaleTab');

// Radix popper copies the content's computed z onto its portal wrapper — without this the
// dropdown (shadcn default z-50) paints behind the full-screen modal (z-4000). See memory.
const SELECT_CONTENT_STYLE = { zIndex: Z_INDEX.selectDropdown };
const DARK_TRIGGER_CLASS = `w-full ${SWAP_MODAL_OUTLINE_BUTTON_CLASS}`;
const SECTION_LABEL_CLASS =
  'mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]';
const RECRAFT_HINT = 'Crisp sharpen — fixed ratio, no scale control';

export interface UpscaleTabApi {
  ParamsPanel: ReactNode;
  /** Always true when a version is selected (model + scale are always valid — hard allowlist + clamp). */
  canCommit: boolean;
  /** Resolves to the new permanent Storage URL; throws EditApiError on API failure. */
  commit: (version: Illustration) => Promise<string>;
}

interface UseUpscaleTabOptions {
  selectedVersion: Illustration | null;
}

export function useUpscaleTabState({ selectedVersion }: UseUpscaleTabOptions): UpscaleTabApi {
  const [model, setModel] = useState<UpscaleModel>(DEFAULT_UPSCALE_MODEL);
  const [scale, setScale] = useState<number>(SCALE.default);
  const [faceEnhance, setFaceEnhance] = useState<boolean>(DEFAULT_FACE_ENHANCE);

  // Per-model gate — switching model keeps scale/faceEnhance state, only flips disabled flags.
  const caps = useMemo(() => UPSCALE_MODEL_CAPS[model], [model]);

  const canCommit = !!selectedVersion;

  const commit = useCallback(
    async (version: Illustration): Promise<string> => {
      const payload = buildUpscalePayload(model, scale, faceEnhance, version.media_url);
      log.info('commit', 'upscale start', {
        imageUrl: version.media_url.slice(0, 60),
        model,
        scale,
        faceEnhance: payload.modelParams.params.faceEnhance,
      });

      const res = await callImageUpscale(payload);
      if (!res.success || !res.data) {
        const failure = res as ImageApiFailure;
        log.warn('commit', 'upscale failed', {
          errorCode: failure.errorCode,
          httpStatus: failure.httpStatus,
        });
        throw new EditApiError(failure.error ?? 'Upscale failed', {
          errorCode: failure.errorCode,
          httpStatus: failure.httpStatus,
        });
      }

      log.info('commit', 'upscale success', {
        fixedRatio: res.meta?.fixedRatio,
        width: res.data.width,
        height: res.data.height,
      });
      return res.data.imageUrl;
    },
    [model, scale, faceEnhance],
  );

  const ParamsPanel = useMemo<ReactNode>(
    () => (
      <div className="flex flex-col gap-5 px-4 py-4">
        <section>
          <p className={SECTION_LABEL_CLASS}>Model</p>
          <Select value={model} onValueChange={(v) => setModel(v as UpscaleModel)}>
            <SelectTrigger className={DARK_TRIGGER_CLASS} aria-label="Upscale model">
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
        </section>

        <section>
          <div className="grid grid-cols-2 gap-3">
            {/* Scale — disabled for recraft (fixed-ratio native passthrough). */}
            <div
              className={caps.supportsScale ? undefined : 'opacity-40'}
              title={caps.supportsScale ? undefined : RECRAFT_HINT}
            >
              <p className={SECTION_LABEL_CLASS}>Scale</p>
              <NumberStepper
                value={scale}
                min={SCALE.min}
                max={SCALE.max}
                step={SCALE.step}
                onChange={setScale}
                disabled={!caps.supportsScale}
              />
            </div>

            {/* Face Enhance — disabled for recraft (no field). ⚡ default OFF (sent explicit). */}
            <div
              className={caps.supportsFaceEnhance ? undefined : 'opacity-40'}
              title={caps.supportsFaceEnhance ? undefined : RECRAFT_HINT}
            >
              <p className={SECTION_LABEL_CLASS}>Face Enhance</p>
              <div className="flex items-center gap-2">
                <Switch
                  checked={faceEnhance}
                  onCheckedChange={setFaceEnhance}
                  disabled={!caps.supportsFaceEnhance}
                  aria-label="Face enhance"
                />
                <span className="text-[11px] font-medium text-[var(--swap-modal-text-muted)]">
                  {faceEnhance ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>

          {!caps.supportsScale && (
            <p className="mt-2 text-[11px] text-[var(--swap-modal-text-muted)]">{RECRAFT_HINT}</p>
          )}
        </section>
      </div>
    ),
    [model, scale, faceEnhance, caps],
  );

  return { ParamsPanel, canCommit, commit };
}
