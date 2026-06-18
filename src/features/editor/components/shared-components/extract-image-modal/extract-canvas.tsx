// extract-canvas.tsx — Center canvas (design README §3.3): stage-header with the `⭐ Extract`
// commit button + a dark checkerboard preview of the selected result (RGBA) or the source
// image. Busy overlay covers processing (Segmenting…/Splitting…) and committing (Saving…).
// Presentational/dumb — commit handler + state come from the root.

import { Star, Loader2 } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import type { ExtractResult } from './extract-image-modal-constants';

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
  /** "Segmenting…" | "Splitting…" — tab-aware label for the processing overlay. */
  processingLabel: string;
  onCommitExtract: () => void;
  commitDisabled: boolean;
}

export function ExtractCanvas({
  sourceUrl,
  selectedResult,
  isProcessing,
  isCommitting,
  processingLabel,
  onCommitExtract,
  commitDisabled,
}: ExtractCanvasProps) {
  const previewUrl = selectedResult?.media_url ?? sourceUrl ?? null;
  const overlayActive = isProcessing || isCommitting;

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--swap-modal-canvas-bg)]">
      {/* stage-header: ⭐ Extract commit action (left-aligned) */}
      <div className="flex shrink-0 items-center justify-start gap-2 border-b border-[var(--swap-modal-border)] px-4 py-2">
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
      </div>

      {/* canvas */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-auto p-6"
        style={CHECKERBOARD_STYLE}
      >
        {previewUrl ? (
          <img
            key={previewUrl}
            src={previewUrl}
            alt={selectedResult ? 'Extracted result' : 'Source image'}
            className="max-h-full max-w-full object-contain"
          />
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
            <p className="text-sm text-white">{isCommitting ? 'Saving…' : processingLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}
