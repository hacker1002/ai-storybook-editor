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
//
// A hover-revealed ImageDownloadButton (bottom-right, group-hover) is shown whenever a real image
// is rendered; its click stopPropagation-s so downloading never toggles cell selection.

'use client';

import { useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Geometry } from '@/types/canvas-types';
import { ImageDownloadButton } from '@/features/editor/components/shared-components/image-download-button';
import {
  useIsLockedByOther,
  useLockHolderName,
  FALLBACK_HOLDER_NAME,
  type LockTarget,
} from '@/stores/resource-lock-store';
import { createLogger } from '@/utils/logger';
import { LockedByOtherOverlay } from './sketch-locked-by-other-overlay';

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
  /** SketchSpreadImage.id backing this page — the edit-lock resource_id (type 1). Undefined for a
   *  page with no image yet (nothing lockable). */
  imageId?: string;
}

export function LockedPageImage({
  geometry,
  url,
  generating,
  ordinal,
  isSelected,
  onSelect,
  imageId,
}: LockedPageImageProps) {
  const [imgError, setImgError] = useState(false);

  // Advisory grey-out: is THIS page image locked by another editor? (phase-02 selectors; a fresh
  // target object is fine — the selectors return primitives, so no re-render loop.) resource_id ''
  // when the page has no image → never matches a lock → false.
  const lockTarget: LockTarget = { step: 1, resource_type: 1, resource_id: imageId ?? '', locale: null };
  const lockedByOther = useIsLockedByOther(lockTarget);
  const holderName = useLockHolderName(lockTarget);

  // A page image is selectable only when it has a resolved url, no generate job is running
  // (race-guard — design §5.2), and no OTHER editor holds its lock. Placeholder / errored /
  // generating / other-held pages are inert.
  const canSelect = Boolean(url) && !imgError && !generating && !lockedByOther;

  const handleSelect = () => {
    if (!canSelect) return;
    log.debug('handleSelect', 'select page image', { ordinal, isSelected });
    onSelect?.();
  };

  // Clicking an other-held page image never selects — it just surfaces who is editing.
  const handleLockedClick = () => {
    const name = holderName ?? FALLBACK_HOLDER_NAME;
    log.debug('handleLockedClick', 'blocked — locked by other', { ordinal });
    toast.info(`${name} is editing this page`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSelect) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect();
    }
  };

  // Show the hover download button whenever a real image is rendered (has url, not errored,
  // not generating) and it is not other-held. It needs pointer events, which the cell only grants
  // when canSelect (or locked); align it with a real, non-locked image.
  const showDownload = Boolean(url) && !imgError && !generating && !lockedByOther;

  const cellClassName = [
    'group absolute overflow-hidden',
    lockedByOther
      ? 'cursor-not-allowed pointer-events-auto'
      : canSelect
        ? 'cursor-pointer pointer-events-auto'
        : 'pointer-events-none',
    isSelected && !lockedByOther ? 'ring-2 ring-inset ring-primary' : '',
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
      // Selectable → a toggle button (valid aria-pressed); other-held / inert → static labeled image.
      role={canSelect ? 'button' : 'img'}
      aria-label={
        lockedByOther
          ? `Spread page ${ordinal} sketch — locked by ${holderName ?? FALLBACK_HOLDER_NAME}`
          : `Spread page ${ordinal} sketch`
      }
      aria-disabled={lockedByOther || undefined}
      aria-pressed={canSelect ? isSelected : undefined}
      title={lockedByOther ? `${holderName ?? FALLBACK_HOLDER_NAME} is editing` : undefined}
      tabIndex={canSelect ? 0 : -1}
      onClick={lockedByOther ? handleLockedClick : canSelect ? handleSelect : undefined}
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

      {showDownload && url && (
        <ImageDownloadButton
          url={url}
          filename={`spread-page-${ordinal}`}
          label={`Download spread page ${ordinal}`}
          className="absolute right-1.5 bottom-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        />
      )}

      {/* Other-held → dim veil + 🔒 badge (cell owns the click/hover → veil stays pointer-inert). */}
      {lockedByOther && url && !imgError && (
        <LockedByOtherOverlay holderName={holderName} />
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
