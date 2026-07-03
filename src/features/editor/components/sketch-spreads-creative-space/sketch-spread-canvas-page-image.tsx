// sketch-spread-canvas-page-image.tsx — LockedPageImage: a per-page sketch backdrop for the
// dedicated SketchSpreadCanvas. Deliberately a PLAIN <img object-fit:cover> (NOT EditableImage —
// validation session 1): non-selectable, non-draggable, clipped to its per-page cell.
//
// States:
//  - has url            → <img> cover fill
//  - onError            → static "image unavailable" placeholder (imgError local state)
//  - no url             → static "no sketch yet" placeholder
//  - generating (spread focus job running) → spinner overlay on top of whichever state
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
}

export function LockedPageImage({ geometry, url, generating, ordinal }: LockedPageImageProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className="pointer-events-none absolute overflow-hidden"
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.w}%`,
        height: `${geometry.h}%`,
      }}
      data-sketch-page-image={ordinal}
    >
      {url && !imgError ? (
        <img
          src={url}
          alt={`Spread page ${ordinal} sketch`}
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
