// sketch-spread-canvas-page-image.tsx — LockedPageImage: a per-page sketch backdrop for the
// dedicated SketchSpreadCanvas. A PLAIN <img object-fit:cover> (NOT EditableImage — keeps cover;
// EditableImage is object-contain): geometry-LOCKED (never drag/resize/crop) but, since
// validation session 1 (2026-07-04), SELECTABLE — clicking a rendered page image selects it so
// the SketchImageToolbar (Edit/Extract) can mount. Selection highlight = an inset ring drawn on
// the cell (NOT SelectionFrame, which forces a hard border + a Moveable mount even when
// drag/resize are disabled). Inset (not outside) so the highlight stays visible for a full-bleed
// page whose cell fills — and is clipped by — the frame's overflow.
//
// States:
//  - has url            → <img> cover fill (selectable when not generating)
//  - onError            → static "image unavailable" placeholder (imgError local state)
//  - no url             → static "no sketch yet" placeholder (never selectable)
//  - generating (spread focus job running) → spinner overlay + non-selectable (race-guard)
//
// Error state resets naturally on url change because the parent keys this component by url
// (remount) — avoids a set-state-in-effect (React-19 lint error).

'use client';

import { useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import type { Geometry } from '@/types/canvas-types';
import { createLogger } from '@/utils/logger';

const log = createLogger('Editor', 'SketchLockedPageImage');

export interface LockedPageImageProps {
  /** Per-page placement in canvas % (from SKETCH_PAGE_GEOMETRY[type]). */
  geometry: Geometry;
  /** Effective media url for this page, or null when it has no image yet. */
  url: string | null;
  /** True while the owning spread's generate job is running (overlay spinner). */
  generating: boolean;
  /** 1-based page ordinal for the alt text (no sensitive data). */
  ordinal: number;
  /** Selection highlight — inset ring when true. */
  isSelected: boolean;
  /** Select this page image. Only wired when the image is selectable (has url, not generating). */
  onSelect?: () => void;
}

export function LockedPageImage({
  geometry,
  url,
  generating,
  ordinal,
  isSelected,
  onSelect,
}: LockedPageImageProps) {
  const [imgError, setImgError] = useState(false);

  // A page image is selectable only when it has a resolved url and no generate job is running
  // (race-guard — design §5.2). Placeholder / errored / generating pages are inert.
  const canSelect = Boolean(url) && !imgError && !generating;

  const handleSelect = () => {
    if (!canSelect) return;
    log.debug('handleSelect', 'select page image', { ordinal, isSelected });
    onSelect?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSelect) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect();
    }
  };

  const cellClassName = [
    'absolute overflow-hidden',
    canSelect ? 'cursor-pointer pointer-events-auto' : 'pointer-events-none',
    isSelected ? 'ring-2 ring-inset ring-primary' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cellClassName}
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
      }}
      data-sketch-page-image={ordinal}
      // Selectable → a toggle button (valid aria-pressed); otherwise a static labeled image.
      role={canSelect ? 'button' : 'img'}
      aria-label={`Spread page ${ordinal} sketch`}
      aria-pressed={canSelect ? isSelected : undefined}
      tabIndex={canSelect ? 0 : -1}
      onClick={canSelect ? handleSelect : undefined}
      onKeyDown={canSelect ? handleKeyDown : undefined}
    >
      {url && !imgError ? (
        <img
          src={url}
          alt=""
          draggable={false}
          onError={() => {
            log.debug('onError', 'page image load failed', { ordinal });
            setImgError(true);
          }}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/40 text-muted-foreground">
          <ImageOff className="h-6 w-6 opacity-60" aria-hidden="true" />
          <span className="text-[11px]">{imgError ? 'Image unavailable' : 'No sketch yet'}</span>
        </div>
      )}

      {generating && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/60"
          role="status"
          aria-label="Generating page image"
        >
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

export default LockedPageImage;
