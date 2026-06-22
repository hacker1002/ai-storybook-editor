// extract-canvas.tsx — Center canvas (design README §3.3): stage-header with the `⭐ Extract`
// commit button + a dark checkerboard preview of the selected result (RGBA) or the source
// image. Busy overlay covers processing (Segmenting…/Splitting…) and committing (Saving…).
// Presentational/dumb — commit handler + state come from the root.

import { useCallback, useState, type ReactNode } from 'react';
import { Star, Loader2, ScanSearch } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import { HEADER_HEIGHT_PX, type ExtractResult } from './extract-image-modal-constants';

const log = createLogger('Editor', 'ExtractCanvas');

// Dark checkerboard so transparent PNGs read correctly (design §2.6, cell ~12px).
const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundColor: '#0e1220',
  backgroundImage:
    'linear-gradient(45deg, #141a2c 25%, transparent 25%), linear-gradient(-45deg, #141a2c 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #141a2c 75%), linear-gradient(-45deg, transparent 75%, #141a2c 75%)',
  backgroundSize: '24px 24px',
  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
};

interface ExtractCanvasProps {
  /** Resolved source image URL (shown when no result is selected). */
  sourceUrl?: string;
  selectedResult: ExtractResult | null;
  isProcessing: boolean;
  isCommitting: boolean;
  /** "Segmenting…" | "Splitting…" | "Detecting…" — tab-aware processing-overlay label. */
  processingLabel: string;
  /** Commit-overlay label (default "Saving…"; Objects = "Extracting…"). */
  committingLabel?: string;
  onCommitExtract: () => void;
  commitDisabled: boolean;
  /** `box-overlay` (Objects) → always show source + interactive overlay; else result preview. */
  interactionMode?: 'result-grid' | 'box-overlay';
  /** Box overlay node (Objects CanvasOverlay) — rendered over the source in box-overlay mode. */
  overlay?: ReactNode;
  /** Source <img> onLoad — captures natural dims for the overlay ratio math. */
  onImageLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  /** 🔍 Detect (box-overlay only) — AI auto-populate boxes. */
  onDetect?: () => void;
  canDetect?: boolean;
  detectVisible?: boolean;
}

export function ExtractCanvas({
  sourceUrl,
  selectedResult,
  isProcessing,
  isCommitting,
  processingLabel,
  committingLabel = 'Saving…',
  onCommitExtract,
  commitDisabled,
  interactionMode = 'result-grid',
  overlay,
  onImageLoad,
  onDetect,
  canDetect = false,
  detectVisible = false,
}: ExtractCanvasProps) {
  const isBoxOverlay = interactionMode === 'box-overlay';
  // box-overlay always shows the source (boxes draw over it); result-grid previews the result.
  const previewUrl = isBoxOverlay ? sourceUrl ?? null : selectedResult?.media_url ?? sourceUrl ?? null;
  const overlayActive = isProcessing || isCommitting;
  const detectDisabled = !canDetect || overlayActive;

  // Source natural aspect-ratio (box-overlay only). Drives the wrapper's aspect-ratio so the
  // image fits-contain on its longest edge (parity with the result-grid <img>), while the
  // wrapper still coincides 1:1 with the rendered image rect for overlay-box mapping. Without
  // it the wrapper is shrink-to-fit → the inner img's `max-h-full` resolves against an
  // auto-height parent (ignored) → the image fits width only and overflows tall canvases.
  // Keyed by url so a source swap can't apply a stale ratio (no set-state-in-effect — React 19).
  const [natural, setNatural] = useState<{ url: string; ratio: number } | null>(null);
  const handleSourceLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const im = e.currentTarget;
      if (im.naturalWidth > 0 && im.naturalHeight > 0 && previewUrl) {
        setNatural({ url: previewUrl, ratio: im.naturalWidth / im.naturalHeight });
      }
      onImageLoad?.(e);
    },
    [onImageLoad, previewUrl],
  );
  const sourceAspectRatio = natural && natural.url === previewUrl ? natural.ratio : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--swap-modal-canvas-bg)]">
      {/* stage-header: ⭐ Extract (+ 🔍 Detect in box-overlay mode) */}
      <div
        className="flex shrink-0 items-center justify-start gap-2 border-b border-[var(--swap-modal-border)] px-4"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <button
          type="button"
          aria-label="Extract to spread"
          aria-busy={isCommitting}
          disabled={commitDisabled}
          onClick={() => {
            log.debug('onClick', 'commit extract');
            onCommitExtract();
          }}
          className="flex items-center gap-1.5 rounded-md bg-[var(--swap-modal-accent)] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--swap-modal-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)]"
        >
          {isCommitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Star className="h-4 w-4" aria-hidden="true" />
          )}
          Extract
        </button>

        {detectVisible && (
          <button
            type="button"
            aria-label="Detect objects"
            aria-busy={isProcessing}
            disabled={detectDisabled}
            title={canDetect ? 'Detect objects (AI)' : 'Detect needs scene context'}
            onClick={() => {
              log.debug('onClick', 'detect');
              onDetect?.();
            }}
            className="flex items-center gap-1.5 rounded-md border border-[var(--swap-modal-border-strong)] bg-[var(--swap-modal-surface-hover)] px-3 py-1.5 text-sm font-semibold text-[var(--swap-modal-text-primary)] transition-colors hover:bg-[var(--swap-modal-surface-hover-strong)] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-[var(--swap-modal-accent)]"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ScanSearch className="h-4 w-4" aria-hidden="true" />
            )}
            Detect
          </button>
        )}
      </div>

      {/* canvas */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-auto p-6"
        style={CHECKERBOARD_STYLE}
      >
        {previewUrl ? (
          isBoxOverlay ? (
            // Wrapper carries the source aspect-ratio → fits-contain on the longest edge (parity
            // with the result-grid <img>) AND coincides 1:1 with the rendered image so the
            // absolute overlay maps to its box. Falls back to width-fit until the ratio loads.
            <div
              className="relative max-h-full max-w-full leading-[0]"
              style={sourceAspectRatio ? { aspectRatio: String(sourceAspectRatio) } : undefined}
            >
              <img
                key={previewUrl}
                src={previewUrl}
                alt="Source image"
                onLoad={handleSourceLoad}
                draggable={false}
                className={
                  sourceAspectRatio
                    ? 'block h-full w-full object-contain'
                    : 'block max-h-full max-w-full object-contain'
                }
              />
              {overlay}
            </div>
          ) : (
            <img
              key={previewUrl}
              src={previewUrl}
              alt={selectedResult ? 'Extracted result' : 'Source image'}
              className="max-h-full max-w-full object-contain"
            />
          )
        ) : (
          <p className="text-sm text-[var(--swap-modal-text-muted)]">No source image</p>
        )}

        {overlayActive && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60"
          >
            <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden="true" />
            <p className="text-sm text-white">{isCommitting ? committingLabel : processingLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}
