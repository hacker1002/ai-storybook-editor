// crop-sheet-stage.tsx — Center stage of SwapCropSheetModal (design §3.3).
// StageHeader: Compare toggle [▣] + zoom slider. StageCanvas: the active crop
// sheet rendered either as a single image (non-compare) or a before/after
// react-compare-slider.
//
// DEFERRED (Validation S1): v1 has no swap_results, so `selectedSwap` is always
// null → the Compare button stays disabled and the canvas only shows the
// original `sheet.image_url`. The compare branch + busy/error overlays are kept
// dormant (future-ready) — do NOT delete.
//
// Slider engine: react-compare-slider@4 has no controlled `position` prop, only
// uncontrolled `defaultPosition`. `dividerPosition` is therefore an init value;
// the inner body is keyed by the image URLs so a parent reset re-applies it.

import { useState } from 'react';
import { ReactCompareSlider } from 'react-compare-slider';
import {
  Columns2,
  Loader2,
  AlertTriangle,
  ImageOff,
  ScanLine,
  RotateCcw,
} from 'lucide-react';
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

// Checkerboard — simulates a transparent backdrop behind the sheet image.
const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%), linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
};

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
  const isEmptySheet = sheet !== null && sheet.image_url === '';
  // Compare needs a swap result to diff against (always null in v1).
  const compareDisabled = selectedSwap === null || sheet === null || isEmptySheet;

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
            <TooltipContent>
              Chưa có swap result để so sánh
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      <div className="flex items-center gap-2">
        <ScanLine
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="range"
          role="slider"
          aria-label="Zoom"
          aria-valuenow={zoomLevel}
          aria-valuemin={ZOOM.min}
          aria-valuemax={ZOOM.max}
          min={ZOOM.min}
          max={ZOOM.max}
          step={ZOOM.step}
          value={zoomLevel}
          onChange={(e) => {
            const next = Number(e.target.value);
            log.debug('onChange', 'zoom change', { zoom: next });
            onZoomChange(next);
          }}
          className="h-1 w-[140px] cursor-pointer accent-primary"
        />
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
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
  onDividerChange: (pos: number) => void;
}

function StageCanvas({
  sheet,
  selectedSwap,
  compareMode,
  zoomLevel,
  dividerPosition,
  swapTask,
  onDividerChange,
}: StageCanvasProps) {
  // Tab has no entity / no sheet at all.
  if (sheet === null) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Tab này chưa có key nào
        </p>
      </div>
    );
  }

  // Freshly-added sheet — no content built yet.
  if (sheet.image_url === '') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <ImageOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Sheet trống</p>
        <p className="text-xs text-muted-foreground">
          Chạy build hoặc thêm nội dung cho sheet này
        </p>
      </div>
    );
  }

  const swapUrl = selectedSwap?.media_url ?? null;

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-auto p-6">
      <div
        // `transform: scale` applied on the inner wrapper for both modes.
        style={{
          transform: `scale(${zoomLevel / 100})`,
          transformOrigin: 'center',
        }}
        className="relative h-[70vh] w-[70vh] max-h-full max-w-full overflow-hidden rounded-md"
      >
        <div className="absolute inset-0" style={CHECKERBOARD_STYLE} />

        {compareMode && swapUrl !== null ? (
          <CompareBody
            // Key by URL pair so the uncontrolled slider re-applies
            // `defaultPosition` when the compared images change.
            key={`${sheet.image_url}|${swapUrl}`}
            originalUrl={sheet.image_url}
            swappedUrl={swapUrl}
            dividerPosition={dividerPosition}
            onDividerChange={onDividerChange}
          />
        ) : (
          <CanvasImage
            key={swapUrl ?? sheet.image_url}
            url={swapUrl ?? sheet.image_url}
          />
        )}
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

// ── CanvasImage — single-image (non-compare) ─────────────────────────────────

interface CanvasImageProps {
  url: string;
}

/** Single image with its own load/error state — keyed by URL by the parent so
 *  no useEffect+setState is needed to reset on URL change. */
function CanvasImage({ url }: CanvasImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <>
      <img
        src={url}
        alt="Crop sheet"
        onLoad={() => setLoaded(true)}
        onError={() => {
          log.warn('CanvasImage', 'image failed to load', {
            // Log only the path tail — full URL may carry signed tokens (PII).
            urlTail: url.slice(url.lastIndexOf('/') + 1),
          });
          setErrored(true);
        }}
        className="relative h-full w-full object-contain"
      />
      {!loaded && !errored && (
        <div className="absolute inset-0 flex animate-pulse items-center justify-center bg-muted">
          <ScanLine className="h-8 w-8 text-muted-foreground/50" />
        </div>
      )}
      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted">
          <ImageOff className="h-8 w-8 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Ảnh lỗi</span>
        </div>
      )}
    </>
  );
}

// ── CompareBody — before/after slider ────────────────────────────────────────

interface CompareBodyProps {
  originalUrl: string;
  swappedUrl: string;
  dividerPosition: number;
  onDividerChange: (pos: number) => void;
}

/** before/after compare. Keyed by URL pair upstream so the uncontrolled slider
 *  resets to `dividerPosition` whenever the compared images change. */
function CompareBody({
  originalUrl,
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
          <img
            src={originalUrl}
            alt="Ảnh gốc"
            className="h-full w-full object-contain"
          />
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
