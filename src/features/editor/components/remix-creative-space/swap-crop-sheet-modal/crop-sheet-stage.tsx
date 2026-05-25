// crop-sheet-stage.tsx — Center stage of SwapCropSheetModal (design §3.3).
// StageHeader: Compare toggle [▣] + zoom slider. StageCanvas: the active crop
// sheet composed client-side from `crops[] + sheet_geometry` (build API removed
// 2026-05-19) rendered either alone (non-compare) or in a before/after
// react-compare-slider.
//
// `selectedSwap` is null until a sheet carries swap_results (populated by the
// character-swap job via realtime); until then Compare is disabled and the
// canvas shows the composed crop sheet. Busy/error overlays read `swapTask`
// (derived from the realtime `jobs[]` slice).
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
  /** True while the active entity's enqueue POST is in flight — shows a
   *  "Starting swap…" overlay before the job's running state takes over. */
  isSubmitting: boolean;
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
  isSubmitting,
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
      // Dark theme container (Phase 07): swap-modal-bg base so the stage sits
      // on the modal's dark canvas without bleeding light surfaces.
      className="flex h-full min-w-0 flex-1 flex-col bg-[var(--swap-modal-bg)]"
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
        isSubmitting={isSubmitting}
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
      // Dark stage header (Phase 07): surface + border tokens.
      className="flex shrink-0 items-center justify-between border-b border-[var(--swap-modal-border)] bg-[var(--swap-modal-surface)] px-4"
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
                  // Dark variant (Phase 07): selection token when pressed,
                  // muted surface + secondary text otherwise.
                  compareMode
                    ? 'border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-selection)] font-medium text-[var(--swap-modal-text-primary)]'
                    : 'border-[var(--swap-modal-border)] text-[var(--swap-modal-text-muted)] hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)]',
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

      <div className="flex items-center gap-2 text-[var(--swap-modal-text-primary)]">
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
          // Dark ghost button (Phase 07): muted icon, surface hover.
          className="h-8 w-8 text-[var(--swap-modal-text-muted)] hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)]"
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
          className="h-8 w-8 text-[var(--swap-modal-text-muted)] hover:bg-[var(--swap-modal-surface-hover)] hover:text-[var(--swap-modal-text-primary)]"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <span
          className="w-12 text-right text-sm font-medium tabular-nums text-[var(--swap-modal-text-secondary)]"
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
  isSubmitting: boolean;
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
  isSubmitting,
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
      <div className="flex flex-1 items-center justify-center bg-[var(--swap-modal-canvas-bg)] p-8 text-center">
        <p className="text-sm text-[var(--swap-modal-text-muted)]">
          Tab này chưa có key nào
        </p>
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
      // viewport — scrolls the canvas-inner. Dark muted backdrop (Phase 07):
      // canvas-bg token so the white sheet frame pops against deep navy. See
      // `--swap-modal-canvas-bg` (#0c0f16) in swap-modal-constants.
      className="relative min-h-0 flex-1 overflow-auto bg-[var(--swap-modal-canvas-bg)]"
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
          // Sheet frame: intentionally bg-white — pops against the dark
          // canvas backdrop (design §4.12, Phase 07 audit). Do NOT theme.
          className="relative shrink-0 overflow-hidden rounded-md bg-[var(--swap-modal-sheet-frame-bg)] shadow-2xl"
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
              zoomLevel={zoomLevel}
            />
          ) : swapUrl !== null ? (
            <CanvasImage key={swapUrl} url={swapUrl} />
          ) : (
            <div className="relative h-full w-full">
              <ComposedCropSheet sheet={sheet} zoomLevel={zoomLevel} />
            </div>
          )}
        </div>
      </div>

      {/* Busy/error overlays driven by `swapTask` (derived from jobs[]) plus the
          in-flight `isSubmitting` cue. Dark overlays (Phase 07): backdrop token +
          white-text labels. While submitting, show "Starting swap…" and suppress
          a stale error from the previous attempt (the seed hasn't landed yet). */}
      {(isSubmitting || swapTask.state === 'running') && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--swap-modal-backdrop)] backdrop-blur-sm"
        >
          <Loader2 className="h-7 w-7 animate-spin text-[var(--swap-modal-accent)]" />
          <span className="text-sm text-[var(--swap-modal-text-secondary)]">
            {swapTask.state === 'running'
              ? `Swapping ${swapTask.current}/${swapTask.total} sheets`
              : 'Starting swap…'}
          </span>
        </div>
      )}

      {!isSubmitting && swapTask.state === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--swap-modal-backdrop)] px-4 text-center backdrop-blur-sm">
          <AlertTriangle className="h-7 w-7 text-destructive" />
          <span className="text-sm font-medium text-destructive">
            Swap failed
          </span>
          <span className="text-xs text-destructive">{swapTask.message}</span>
          <span className="mt-1 flex items-center gap-1 text-xs text-[var(--swap-modal-text-muted)]">
            <RotateCcw className="h-3.5 w-3.5" />
            Click [⇄] in the sidebar to retry
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
  zoomLevel: number;
}

/** before/after compare — "before" is the composed crop sheet, "after" is the
 *  swap result. Keyed by the swap URL upstream so the uncontrolled slider
 *  resets to `dividerPosition` whenever the "after" image changes. */
function CompareBody({
  sheet,
  swappedUrl,
  dividerPosition,
  onDividerChange,
  zoomLevel,
}: CompareBodyProps) {
  return (
    <>
      <ReactCompareSlider
        defaultPosition={dividerPosition}
        onPositionChange={onDividerChange}
        className="relative h-full w-full"
        itemOne={
          <div className="relative h-full w-full">
            <ComposedCropSheet sheet={sheet} zoomLevel={zoomLevel} />
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
      {/* Dark Before/After badges (Phase 07): card-bg token over sheet image
          for legibility (background is mostly white sheet content). */}
      <span className="absolute left-2 top-2 z-10 rounded bg-[var(--swap-modal-card-bg)]/85 px-1.5 py-0.5 text-xs text-[var(--swap-modal-text-secondary)]">
        Before
      </span>
      <span className="absolute right-2 top-2 z-10 rounded bg-[var(--swap-modal-card-bg)]/85 px-1.5 py-0.5 text-xs text-[var(--swap-modal-text-secondary)]">
        After
      </span>
    </>
  );
}
