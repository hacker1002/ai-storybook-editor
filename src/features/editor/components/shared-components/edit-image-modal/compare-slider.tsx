// compare-slider.tsx — Thin dark-themed wrapper around react-compare-slider (already a
// dep — swap-crop-sheet-modal) for the EditImageModal stage Compare mode (design §2.3/§3.3).
// before = selectedVersion.original_url, after = selectedVersion.media_url. Both images fit
// -contain on the checkerboard so RGBA results (transparent rmbg / erase) read correctly.
//
// Sizing: the wrapper box dimensions come from the canvas shell (see edit-image-modal-fit.ts)
// so all three modes (preview/compare/eraser) render the same image at the same display size.

import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import type { Size } from './edit-image-modal-fit';

interface CompareSliderProps {
  before: string;
  after: string;
  /** Display dimensions from the shared fit logic (canvas-modal owns the calc). */
  size: Size;
  beforeLabel?: string;
  afterLabel?: string;
}

const FIT_CONTAIN: React.CSSProperties = { objectFit: 'contain' };

export function CompareSlider({
  before,
  after,
  size,
  beforeLabel = 'ORIGINAL',
  afterLabel = 'RESULT',
}: CompareSliderProps) {
  return (
    <div className="relative" style={{ width: size.w, height: size.h }}>
      <ReactCompareSlider
        className="h-full w-full"
        // Key by the url pair so an uncontrolled slider resets to center on version change.
        key={`${before}|${after}`}
        itemOne={<ReactCompareSliderImage src={before} alt={beforeLabel} style={FIT_CONTAIN} />}
        itemTwo={<ReactCompareSliderImage src={after} alt={afterLabel} style={FIT_CONTAIN} />}
      />
      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-[var(--swap-modal-card-bg)]/85 px-1.5 py-0.5 text-xs font-medium text-[var(--swap-modal-text-secondary)]">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-[var(--swap-modal-card-bg)]/85 px-1.5 py-0.5 text-xs font-medium text-[var(--swap-modal-text-secondary)]">
        {afterLabel}
      </span>
    </div>
  );
}
