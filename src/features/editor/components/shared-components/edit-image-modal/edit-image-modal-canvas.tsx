// edit-image-modal-canvas.tsx — Center stage (design §3.3): stage-header (Compare toggle +
// zoom range) + checkerboard canvas. canvasMode switches the body: `compare` → before/after
// CompareSlider; `paint` → the eraser CanvasLayer; `preview` → static <img> (+ optional outpaint
// `previewOverlay`). Zoom = actual CSS width/height on the content (NOT transform:scale — see the
// body comment), so the scroll container reaches the full zoomed range. Presentational/dumb —
// state + handlers come from the shell.

import { type ReactNode } from 'react';
import { Columns2, Loader2 } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { Illustration } from '@/types/prop-types';
import { CompareSlider } from '../compare-slider';
import { HEADER_HEIGHT_PX, ZOOM, type EditCanvasMode } from './edit-image-modal-constants';
import { useImageNaturalSize, useStageFitSize } from './edit-image-modal-fit';
import { ZoomControl } from '../zoom-control';

const log = createLogger('Editor', 'EditImageModalCanvas');

type StageCanvasMode = EditCanvasMode | 'compare';

// Dark checkerboard so transparent RGBA (rmbg / erase) reads correctly (design §2.6).
const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundColor: '#0e1220',
  backgroundImage:
    'linear-gradient(45deg, #141a2c 25%, transparent 25%), linear-gradient(-45deg, #141a2c 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #141a2c 75%), linear-gradient(-45deg, transparent 75%, #141a2c 75%)',
  backgroundSize: '24px 24px',
  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
};

interface EditImageModalCanvasProps {
  canvasMode: StageCanvasMode;
  selectedVersion: Illustration | null;
  /** Active paint-tab interactive canvas (inpaint / erasor — rendered in paint mode). */
  canvasLayer: ReactNode;
  compareMode: boolean;
  canCompare: boolean;
  onToggleCompare: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  isProcessing: boolean;
  processingLabel: string;
  /** Preview-mode overlay (outpaint dashed target frame). Receives the measured scaled box.
   *  Omitted by every other tab → static <img> only. */
  previewOverlay?: (box: { w: number; h: number }) => ReactNode;
}

export function EditImageModalCanvas({
  canvasMode,
  selectedVersion,
  canvasLayer,
  compareMode,
  canCompare,
  onToggleCompare,
  zoom,
  onZoomChange,
  isProcessing,
  processingLabel,
  previewOverlay,
}: EditImageModalCanvasProps) {
  const mediaUrl = selectedVersion?.media_url;
  const originalUrl = selectedVersion?.original_url;

  // Single source of truth for image display dimensions across preview/compare modes.
  // Eraser (paint) mode owns its own canvas via canvasLayer, but uses the same fit helper.
  const naturalSize = useImageNaturalSize(mediaUrl);
  const fitSize = useStageFitSize(naturalSize?.w ?? 0, naturalSize?.h ?? 0);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--swap-modal-canvas-bg)]">
      {/* stage-header: Compare toggle (left) + zoom (right) */}
      <div
        className="flex shrink-0 items-center gap-3 border-b border-[var(--swap-modal-border)] px-4"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <button
          type="button"
          aria-label="Compare original and result"
          aria-pressed={compareMode}
          disabled={!canCompare}
          title={canCompare ? 'Compare (C)' : 'No prior version to compare'}
          onClick={() => {
            log.debug('onClick', 'toggle compare', { next: !compareMode });
            onToggleCompare();
          }}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)]',
            compareMode
              ? 'bg-[var(--swap-modal-accent)] text-white hover:bg-[var(--swap-modal-accent-hover)]'
              : 'border border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-surface-hover)] text-[var(--swap-modal-text-primary)] hover:bg-[var(--swap-modal-surface-hover-strong)]',
          )}
        >
          <Columns2 className="h-4 w-4" aria-hidden="true" />
          Compare
        </button>

        <div className="flex-1" />

        <ZoomControl
          value={zoom}
          onChange={onZoomChange}
          min={ZOOM.min}
          max={ZOOM.max}
          step={ZOOM.step}
        />
      </div>

      {/* canvas
       *
       * Zoom architecture (codebase convention — see generate-image-modal-constants.ts):
       * Apply zoom as actual CSS width/height on the content, NOT `transform: scale()`. CSS
       * width participates in layout → the parent's `overflow-auto` sees the real size and
       * exposes the full scroll range. `transform: scale` would leave layout at fit-size,
       * making the top/left half of any zoomed overflow unreachable.
       *
       * `m-auto` (margin: auto) centers the content when it fits and collapses to 0 when it
       * overflows — unlike flex `items-center`, which clips the start of an overflow axis. */}
      <div
        className="relative flex flex-1 overflow-auto p-6"
        style={CHECKERBOARD_STYLE}
      >
        {!mediaUrl ? (
          <p className="m-auto text-sm text-[var(--swap-modal-text-muted)]">
            No version to display
          </p>
        ) : !fitSize ? (
          // Pre-measure (one-frame): preview mode renders with CSS max so the image shows
          // immediately. compare/paint require fitSize and render once it resolves.
          canvasMode === 'preview' ? (
            <img
              key={mediaUrl}
              src={mediaUrl}
              alt="Selected version"
              className="m-auto block object-contain"
              style={{ maxHeight: '78vh', maxWidth: '100%' }}
            />
          ) : null
        ) : (() => {
          const scaledW = Math.round((fitSize.w * zoom) / 100);
          const scaledH = Math.round((fitSize.h * zoom) / 100);
          const scaledSize = { w: scaledW, h: scaledH };
          if (canvasMode === 'compare' && originalUrl) {
            // All tabs share the before/after CompareSlider. For outpaint the result is a larger
            // aspect than the original, so the contain-fit original reads slightly larger than its
            // place in the result (accepted — product 2026-06-24).
            return (
              <div className="m-auto">
                <CompareSlider before={originalUrl} after={mediaUrl} size={scaledSize} />
              </div>
            );
          }
          if (canvasMode === 'paint') {
            // Active paint tab owns the canvas + cursor; pass scaled dims via the layer wrapper.
            return <div className="m-auto">{canvasLayer}</div>;
          }
          // Preview: relative wrapper (size = scaled box) so an outpaint previewOverlay can pin
          // its dashed frame to the image edges. overflow stays visible → the frame may grow
          // outward past the image. Other tabs pass no overlay → just the <img>.
          return (
            <div className="relative m-auto" style={{ width: scaledW, height: scaledH }}>
              <img
                key={mediaUrl}
                src={mediaUrl}
                alt="Selected version"
                className="block object-contain"
                style={{ width: scaledW, height: scaledH, maxWidth: 'none' }}
              />
              {previewOverlay?.(scaledSize)}
            </div>
          );
        })()}

        {isProcessing && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60"
          >
            <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden="true" />
            <p className="text-sm text-white">{processingLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}
