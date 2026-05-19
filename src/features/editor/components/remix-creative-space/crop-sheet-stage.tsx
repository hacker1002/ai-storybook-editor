// crop-sheet-stage.tsx — Center stage of SwapCropSheetModal (design §3.3).
// StageHeader: Compare toggle [▣] + zoom slider. StageCanvas: the active crop
// sheet composed client-side from `crops[] + sheet_geometry` (build API removed
// 2026-05-19) rendered either alone (non-compare) or in a before/after
// react-compare-slider.
//
// DEFERRED (Validation S1): v1 has no swap_results, so `selectedSwap` is always
// null → the Compare button stays disabled and the canvas only shows the
// composed crop sheet. The compare branch + busy/error overlays are kept
// dormant (future-ready) — do NOT delete.
//
// Slider engine: react-compare-slider@4 has no controlled `position` prop, only
// uncontrolled `defaultPosition`. `dividerPosition` is therefore an init value;
// the inner body is keyed by the swap URL so a parent reset re-applies it.

import { useRef } from 'react';
import { ReactCompareSlider } from 'react-compare-slider';
import { Columns2, Loader2, AlertTriangle, RotateCcw, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { RemixCropSheet, SwapResult, SwapTaskStatus } from '@/types/remix';
import { ZOOM, HEADER_HEIGHT_PX } from './swap-modal-constants';
import { ComposedCropSheet } from './crop-sheet-stage/composed-crop-sheet';
import { useStageZoom } from './crop-sheet-stage/use-stage-zoom';

const log = createLogger('Editor', 'CropSheetStage');

interface CropSheetStageProps {
  sheet: RemixCropSheet | null;
  selectedSwap: SwapResult | null;
  compareMode: boolean;
  zoomLevel: number;
  dividerPosition: number;
  swapTask: SwapTaskStatus;
  onToggleCompare: () => void;
  onZoomChange: (zoom: number) => void;
  onDividerChange: (pos: number) => void;
}

export function CropSheetStage({
  sheet,
  selectedSwap,
  compareMode,
  zoomLevel,
  dividerPosition,
  swapTask,
  onToggleCompare,
  onZoomChange,
  onDividerChange,
}: CropSheetStageProps) {
  // Compare needs a swap result to diff the composed sheet against (always
  // null in v1). The composed "before" is always renderable, so the only gate
  // left is the absence of a swap "after".
  const compareDisabled = selectedSwap === null;

  return (
    <section
      className="flex h-full min-w-0 flex-1 flex-col bg-muted/30"
      aria-label="Crop sheet stage"
    >
      <StageHeader
        compareMode={compareMode}
        compareDisabled={compareDisabled}
        zoomLevel={zoomLevel}
        onToggleCompare={onToggleCompare}
        onZoomChange={onZoomChange}
      />

      <StageCanvas
        sheet={sheet}
        selectedSwap={selectedSwap}
        compareMode={compareMode}
        zoomLevel={zoomLevel}
        dividerPosition={dividerPosition}
        swapTask={swapTask}
        onZoomChange={onZoomChange}
        onDividerChange={onDividerChange}
      />
    </section>
  );
}

// ── StageHeader ──────────────────────────────────────────────────────────────

interface StageHeaderProps {
  compareMode: boolean;
  compareDisabled: boolean;
  zoomLevel: number;
  onToggleCompare: () => void;
  onZoomChange: (zoom: number) => void;
}

function StageHeader({
  compareMode,
  compareDisabled,
  zoomLevel,
  onToggleCompare,
  onZoomChange,
}: StageHeaderProps) {
  return (
    <div
      className="flex shrink-0 items-center justify-between border-b border-border bg-background px-4"
      style={{ height: HEADER_HEIGHT_PX }}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <button
                type="button"
                aria-pressed={compareMode}
                aria-label="So sánh trước/sau"
                disabled={compareDisabled}
                onClick={() => {
                  log.debug('onClick', 'toggle compare', {
                    next: !compareMode,
                  });
                  onToggleCompare();
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors',
                  'disabled:pointer-events-none disabled:opacity-40',
                  compareMode
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Columns2 className="h-4 w-4" aria-hidden="true" />
                Compare
              </button>
            </span>
          </TooltipTrigger>
          {compareDisabled && (
            <TooltipContent>Chưa có swap result để so sánh</TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Decrease zoom"
          disabled={zoomLevel <= ZOOM.min}
          onClick={() => {
            const next = Math.max(zoomLevel - ZOOM.step, ZOOM.min);
            log.debug('onClick', 'zoom decrease', { from: zoomLevel, to: next });
            onZoomChange(next);
          }}
          className="h-8 w-8"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Slider
          value={[zoomLevel]}
          min={ZOOM.min}
          max={ZOOM.max}
          step={ZOOM.step}
          onValueChange={([v]) => {
            log.debug('onValueChange', 'zoom change', { zoom: v });
            onZoomChange(v);
          }}
          aria-label="Zoom level"
          className="w-[120px]"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Increase zoom"
          disabled={zoomLevel >= ZOOM.max}
          onClick={() => {
            const next = Math.min(zoomLevel + ZOOM.step, ZOOM.max);
            log.debug('onClick', 'zoom increase', { from: zoomLevel, to: next });
            onZoomChange(next);
          }}
          className="h-8 w-8"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <span
          className="w-12 text-right text-sm font-medium tabular-nums"
          aria-live="polite"
        >
          {zoomLevel}%
        </span>
      </div>
    </div>
  );
}

// ── StageCanvas ──────────────────────────────────────────────────────────────

interface StageCanvasProps {
  sheet: RemixCropSheet | null;
  selectedSwap: SwapResult | null;
  compareMode: boolean;
  zoomLevel: number;
  dividerPosition: number;
  swapTask: SwapTaskStatus;
  onZoomChange: (zoom: number) => void;
  onDividerChange: (pos: number) => void;
}

function StageCanvas({
  sheet,
  selectedSwap,
  compareMode,
  zoomLevel,
  dividerPosition,
  swapTask,
  onZoomChange,
  onDividerChange,
}: StageCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // Fit-to-canvas + center-anchored zoom. Called before the early return
  // below (Rules of Hooks) — `sheetGeometry: null` makes the hook a no-op
  // when the tab has no sheet.
  useStageZoom({
    viewportRef,
    sheetGeometry: sheet?.sheet_geometry ?? null,
    zoomLevel,
    onZoomChange,
  });

  // Tab has no entity / no sheet at all.
  if (sheet === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">Tab này chưa có key nào</p>
      </div>
    );
  }

  const swapUrl = selectedSwap?.media_url ?? null;
  // Zoom is applied as the canvas-inner real width/height (design §4.3) — the
  // sheet's natural pixel size scaled by the zoom %. Child crops are positioned
  // in percent so they scale automatically.
  const { width: sheetW, height: sheetH } = sheet.sheet_geometry;
  const innerW = (sheetW * zoomLevel) / 100;
  const innerH = (sheetH * zoomLevel) / 100;

  return (
    <div
      ref={viewportRef}
      // viewport — scrolls the canvas-inner; flat muted-gray backdrop.
      className="relative min-h-0 flex-1 overflow-auto bg-muted"
    >
      {/* Centering layer — sheet smaller than the viewport is centered, larger
          scrolls. `safe center` falls back to `start` when the sheet overflows,
          so the left/top edges stay reachable via scroll (without `safe`, the
          centered child gets a negative offset that scroll cannot reach).
          Applied inline because Tailwind's arbitrary-value syntax does not
          accept multi-keyword `safe center`. */}
      <div
        className="flex min-h-full min-w-full"
        style={{ justifyContent: 'safe center', alignItems: 'safe center' }}
      >
        <div
          className="relative shrink-0 overflow-hidden rounded-md bg-white"
          style={{ width: innerW, height: innerH }}
        >
          {compareMode && swapUrl !== null ? (
            <CompareBody
              // Key by the swap URL so the uncontrolled slider re-applies
              // `defaultPosition` when the compared "after" image changes.
              key={swapUrl}
              sheet={sheet}
              swappedUrl={swapUrl}
              dividerPosition={dividerPosition}
              onDividerChange={onDividerChange}
            />
          ) : swapUrl !== null ? (
            <CanvasImage key={swapUrl} url={swapUrl} />
          ) : (
            <div className="relative h-full w-full">
              <ComposedCropSheet sheet={sheet} />
            </div>
          )}
        </div>
      </div>

      {/* DORMANT in v1 — swapTask is always idle (swap deferred). */}
      {swapTask.state === 'running' && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-sm"
        >
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">
            Swapping {swapTask.current}/{swapTask.total} sheets
          </span>
        </div>
      )}

      {swapTask.state === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-destructive/10 px-4 text-center">
          <AlertTriangle className="h-7 w-7 text-destructive" />
          <span className="text-sm font-medium text-destructive">
            Swap thất bại
          </span>
          <span className="text-xs text-destructive">{swapTask.message}</span>
          <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
            Bấm [⇄] ở sidebar để thử lại
          </span>
        </div>
      )}
    </div>
  );
}

// ── CanvasImage — single swap image (non-compare) ────────────────────────────

interface CanvasImageProps {
  url: string;
}

/** Single swap-result image with its own load/error state — keyed by URL by
 *  the parent so no useEffect+setState is needed to reset on URL change. */
function CanvasImage({ url }: CanvasImageProps) {
  return (
    <img
      src={url}
      alt="Swap result"
      onError={() => {
        log.warn('CanvasImage', 'swap image failed to load', {
          // Log only the path tail — full URL may carry signed tokens (PII).
          urlTail: url.slice(url.lastIndexOf('/') + 1),
        });
      }}
      className="relative h-full w-full object-contain"
    />
  );
}

// ── CompareBody — before/after slider ────────────────────────────────────────

interface CompareBodyProps {
  sheet: RemixCropSheet;
  swappedUrl: string;
  dividerPosition: number;
  onDividerChange: (pos: number) => void;
}

/** before/after compare — "before" is the composed crop sheet, "after" is the
 *  swap result. Keyed by the swap URL upstream so the uncontrolled slider
 *  resets to `dividerPosition` whenever the "after" image changes. */
function CompareBody({
  sheet,
  swappedUrl,
  dividerPosition,
  onDividerChange,
}: CompareBodyProps) {
  return (
    <>
      <ReactCompareSlider
        defaultPosition={dividerPosition}
        onPositionChange={onDividerChange}
        className="relative h-full w-full"
        itemOne={
          <div className="relative h-full w-full">
            <ComposedCropSheet sheet={sheet} />
          </div>
        }
        itemTwo={
          <img
            src={swappedUrl}
            alt="Ảnh swap"
            className="h-full w-full object-contain"
          />
        }
      />
      <span className="absolute left-2 top-2 z-10 rounded bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground">
        Before
      </span>
      <span className="absolute right-2 top-2 z-10 rounded bg-background/80 px-1.5 py-0.5 text-xs text-muted-foreground">
        After
      </span>
    </>
  );
}
