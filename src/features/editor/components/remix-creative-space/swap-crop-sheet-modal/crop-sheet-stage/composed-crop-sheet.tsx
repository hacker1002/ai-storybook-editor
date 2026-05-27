// composed-crop-sheet.tsx — Renders a crop sheet client-side by composing each
// crop as an absolutely-positioned <img> inside a frame sized by the sheet's
// `sheet_geometry` (design 05-05-crop-sheet-layout-engine.md §7).
//
// The build API was removed (2026-05-19): `sheet.image_url` is now usually
// empty. The frame fills its container 100% — StageCanvas's canvas-inner owns
// the real pixel size (sheet_geometry × zoom). Each crop's box is positioned
// in percent so the whole sheet scales uniformly with the frame.

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import type { RemixCropSheet, CropEntry } from '@/types/remix';
import { COMPOSER_FRAME, resolveStrokePx } from '../swap-modal-constants';

const log = createLogger('Editor', 'ComposedCropSheet');

interface ComposedCropSheetProps {
  sheet: RemixCropSheet;
  /** Current zoom % — drives the parity stroke width (sheet-px × zoom/100). */
  zoomLevel: number;
}

/** Composes `sheet.crops[]` over a frame sized by `sheet.sheet_geometry`.
 *  Guards an empty/degenerate sheet with a "Sheet trống" placeholder. */
export function ComposedCropSheet({ sheet, zoomLevel }: ComposedCropSheetProps) {
  const { width: sw, height: sh } = sheet.sheet_geometry;
  const strokePx = resolveStrokePx(zoomLevel);

  if (sheet.crops.length === 0 || sw <= 0 || sh <= 0) {
    log.debug('render', 'empty or degenerate sheet — placeholder', {
      crops: sheet.crops.length,
      sw,
      sh,
    });
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-8 text-center">
        <ImageOff className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Sheet trống</p>
        <p className="text-xs text-muted-foreground">
          Sheet này chưa có crop nào
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {sheet.crops.map((crop, index) => (
        <ComposedCrop
          key={`crop-${index}`}
          crop={crop}
          // 1-based index — drawn as a badge for navigation. Order matches
          // `req.crops` (the order the composer processes + reports `skipped[]`
          // by), so the preview numbering lines up with the composed sheet.
          ordinal={index + 1}
          sheetWidth={sw}
          sheetHeight={sh}
          strokePx={strokePx}
        />
      ))}
    </div>
  );
}

// ── ComposedCrop — one absolutely-positioned crop image ──────────────────────

interface ComposedCropProps {
  crop: CropEntry;
  /** 1-based ordinal shown as a badge in the left gutter. */
  ordinal: number;
  sheetWidth: number;
  sheetHeight: number;
  /** Zoom-scaled stroke width (CSS px) — drives both border + inflate. */
  strokePx: number;
}

/** A single crop placed at `geometry / sheet_geometry * 100%`. Keeps its own
 *  error state so a 404 shows a per-crop placeholder without breaking siblings.
 *
 *  Wrapper inflates the crop slot by `cellStrokeWidthPx` on every side and
 *  draws a same-width `cellStrokeColor` border (border-box), reproducing the
 *  composer's per-cell outer stroke. The wrapper is filled with `gutterColor`
 *  so transparent PNG areas read as that colour — matching the flattened PNG
 *  the Python composer bakes (NOT a checkerboard). The ordinal badge sits in
 *  the left gutter strip (see `OrdinalBadge`). */
function ComposedCrop({ crop, ordinal, sheetWidth, sheetHeight, strokePx }: ComposedCropProps) {
  const [errored, setErrored] = useState(false);
  const { x, y, w, h } = crop.geometry;

  const stroke = strokePx;
  const wrapperStyle: React.CSSProperties = {
    position: 'absolute',
    left: `calc(${(x / sheetWidth) * 100}% - ${stroke}px)`,
    top: `calc(${(y / sheetHeight) * 100}% - ${stroke}px)`,
    width: `calc(${(w / sheetWidth) * 100}% + ${stroke * 2}px)`,
    height: `calc(${(h / sheetHeight) * 100}% + ${stroke * 2}px)`,
    // CropEntry (rev2) has no per-crop z-index/variant — crops are stacked in
    // array order (later crops paint on top via DOM order). Stable layering.
    boxSizing: 'border-box',
    borderStyle: 'solid',
    borderWidth: stroke,
    borderColor: COMPOSER_FRAME.cellStrokeColor,
    backgroundColor: COMPOSER_FRAME.gutterColor,
  };

  if (errored) {
    return (
      <div
        style={wrapperStyle}
        className="flex flex-col items-center justify-center gap-1"
      >
        <OrdinalBadge ordinal={ordinal} />
        <ImageOff className="h-6 w-6 text-white/70" />
        <span className="text-[10px] text-white/70">Ảnh lỗi</span>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <OrdinalBadge ordinal={ordinal} />
      <img
        src={crop.media_url}
        alt={crop.name || 'Crop'}
        onError={() => {
          log.warn('ComposedCrop', 'crop image failed to load', {
            // Log only the path tail — full URL may carry signed tokens (PII).
            urlTail: crop.media_url.slice(crop.media_url.lastIndexOf('/') + 1),
          });
          setErrored(true);
        }}
        className="h-full w-full"
      />
    </div>
  );
}

// ── OrdinalBadge — crop index, in the left gutter, top-aligned ────────────────

/** Frontend-only crop index (the composer bakes no ordinals). FIXED size,
 *  zoom-independent — the modal scales the sheet via container width/height,
 *  not `transform`, so `text-sm`/`px-1.5` stay constant at every zoom.
 *
 *  Always rendered in the left separating strip (`-translate-x-full` lifts it
 *  fully out of the cell) so it never overlaps artwork. The layout engine's
 *  widened left margin guarantees gutter room for the first column, so even
 *  column-1 badges stay inside the sheet without clipping. */
function OrdinalBadge({ ordinal }: { ordinal: number }) {
  return (
    <span
      className="pointer-events-none absolute left-0 top-0 z-20 -translate-x-full rounded-l-md rounded-r-none bg-black/85 px-1.5 py-0.5 text-sm font-bold leading-none tabular-nums text-white shadow-sm"
      aria-hidden="true"
    >
      {ordinal}
    </span>
  );
}
