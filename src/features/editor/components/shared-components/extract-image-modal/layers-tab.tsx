// layers-tab.tsx — Layers tab (design 02-layers-tab.md): Qwen multi-layer split. The hook
// owns model + layerCount; it returns a Handle (ParamsPanel + run + gate) the root consumes.
// runExtract → callLayeringImage → N ExtractResult (root REPLACES the grid). No prompt →
// canRun is always true once a source exists (root still gates on source + isProcessing).

import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Minus, Plus } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { callLayeringImage, type LayeringImageResult } from '@/apis/retouch-api';
import type { ImageApiFailure } from '@/apis/image-api-client';
import type { SpreadImage } from '@/types/spread-types';
import {
  LAYERS_MODEL_OPTIONS,
  DEFAULT_LAYERS_MODEL,
  LAYER_COUNT_MIN,
  LAYER_COUNT_MAX,
  LAYER_COUNT_DEFAULT,
  Z_INDEX,
  type ExtractResult,
} from './extract-image-modal-constants';
import { mapExtractError } from './extract-image-modal-utils';

const log = createLogger('Editor', 'LayersTab');

const SELECT_CONTENT_STYLE = { zIndex: Z_INDEX.selectDropdown };
const DARK_TRIGGER_CLASS =
  'w-full bg-[var(--swap-modal-surface-hover)] border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] hover:bg-[var(--swap-modal-surface-hover-strong)] focus-visible:ring-[var(--swap-modal-accent)]';
const SECTION_LABEL_CLASS =
  'mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--swap-modal-text-muted)]';

const clampLayerCount = (n: number): number =>
  Math.max(LAYER_COUNT_MIN, Math.min(LAYER_COUNT_MAX, n));

export interface LayersTabHandle {
  model: string;
  layerCount: number;
  /** Always true (layering needs no prompt); root AND-gates with !isProcessing && source. */
  canRun: boolean;
  ParamsPanel: ReactNode;
  /** Resolves to N results on success; throws Error(mapExtractError) on API failure. */
  runExtract: (sourceUrl: string) => Promise<ExtractResult[]>;
  /** Reset model + layer count (root.resetState on close/forcePop). */
  reset: () => void;
}

interface UseLayersTabOptions {
  /** processing || committing — disables the controls. */
  isBusy: boolean;
  /** Attribution-only snapshot version id → ai_service_logs.snapshot_id (book cost). */
  snapshotId?: string;
}

export function useLayersTabState(
  image: SpreadImage,
  { isBusy, snapshotId }: UseLayersTabOptions,
): LayersTabHandle {
  const [model, setModel] = useState<string>(DEFAULT_LAYERS_MODEL);
  const [layerCount, setLayerCount] = useState<number>(LAYER_COUNT_DEFAULT);

  const runExtract = useCallback(
    async (sourceUrl: string): Promise<ExtractResult[]> => {
      log.info('runExtract', 'layering start', { layerCount });
      // description omitted → API "auto"; seed omitted → API random; goFast/format → API default.
      const res = await callLayeringImage({ imageUrl: sourceUrl, numberOfLayers: layerCount, snapshotId });
      if (!res.success) {
        const failure = res as ImageApiFailure;
        log.warn('runExtract', 'layering failed', {
          errorCode: failure.errorCode,
          httpStatus: failure.httpStatus,
        });
        throw new Error(mapExtractError(failure));
      }

      const ok = res as LayeringImageResult;
      const urls = ok.data?.urls ?? [];
      // One layering call = ONE ai_service_logs row → all N layer results share the SAME
      // aiRequestId (do NOT fabricate per-layer ids). Threaded → illustrations[].ai_request_id.
      const aiRequestId = ok.data?.aiRequestId;
      log.info('runExtract', 'layering success', { count: urls.length });
      return urls.map((url, i) => ({
        id: crypto.randomUUID(),
        media_url: url,
        sourceTab: 'layering' as const,
        title: `${image.title ?? 'Image'} - Part ${i + 1}`,
        aiRequestId,
        meta: { layerIndex: i },
      }));
    },
    [layerCount, image.title, snapshotId],
  );

  const reset = useCallback(() => {
    setModel(DEFAULT_LAYERS_MODEL);
    setLayerCount(LAYER_COUNT_DEFAULT);
  }, []);

  const setClampedLayerCount = useCallback((n: number) => {
    setLayerCount(clampLayerCount(n));
  }, []);

  const atMin = layerCount <= LAYER_COUNT_MIN;
  const atMax = layerCount >= LAYER_COUNT_MAX;

  // Right-sidebar params panel — inlined (not a separate exported component) so this
  // module exports only the hook (react-refresh/only-export-components).
  const ParamsPanel = useMemo<ReactNode>(
    () => (
      <div className="flex flex-col gap-5 px-4 py-4">
        <section>
          <p className={SECTION_LABEL_CLASS}>Model</p>
          <Select value={model} onValueChange={setModel} disabled={isBusy}>
            <SelectTrigger className={DARK_TRIGGER_CLASS} aria-label="Layers model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={SELECT_CONTENT_STYLE}>
              {LAYERS_MODEL_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section>
          <p className={SECTION_LABEL_CLASS}>Layer Count</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease layer count"
              disabled={isBusy || atMin}
              onClick={() => setClampedLayerCount(layerCount - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              type="number"
              value={layerCount}
              min={LAYER_COUNT_MIN}
              max={LAYER_COUNT_MAX}
              disabled={isBusy}
              aria-label="Number of layers"
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!Number.isNaN(val)) setClampedLayerCount(val);
              }}
              className="h-8 w-16 rounded-md border border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-surface-hover)] px-2 text-center text-sm text-[var(--swap-modal-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)] disabled:opacity-40"
            />
            <button
              type="button"
              aria-label="Increase layer count"
              disabled={isBusy || atMax}
              onClick={() => setClampedLayerCount(layerCount + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--swap-modal-border-strong)] text-[var(--swap-modal-text-primary)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-[var(--swap-modal-text-muted)]">
            {LAYER_COUNT_MIN}–{LAYER_COUNT_MAX} layers · each run replaces the set
          </p>
        </section>
      </div>
    ),
    [model, layerCount, isBusy, atMin, atMax, setClampedLayerCount],
  );

  return { model, layerCount, canRun: true, ParamsPanel, runExtract, reset };
}
