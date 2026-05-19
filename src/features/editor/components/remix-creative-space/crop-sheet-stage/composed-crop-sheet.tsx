// composed-crop-sheet.tsx — Renders a crop sheet client-side by composing each
// crop as an absolutely-positioned <img> inside a frame sized by the sheet's
// `sheet_geometry` (design 05-05-crop-sheet-layout-engine.md §7).
//
// The build API was removed (2026-05-19): `sheet.image_url` is now usually
// empty. The frame keeps its aspect ratio via CSS `aspect-ratio` and
// scales-to-fit its container with `max-width/max-height: 100%` — no JS
// measurement. Each crop's box is positioned in percent so the whole sheet
// scales uniformly with the frame.

import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { createLogger } from '@/utils/logger';
import type { RemixCropSheet, RemixCrop } from '@/types/remix';

const log = createLogger('Editor', 'ComposedCropSheet');

interface ComposedCropSheetProps {
  sheet: RemixCropSheet;
}

/** Composes `sheet.crops[]` over a frame sized by `sheet.sheet_geometry`.
 *  Guards an empty/degenerate sheet with a "Sheet trống" placeholder. */
export function ComposedCropSheet({ sheet }: ComposedCropSheetProps) {
  const { width: sw, height: sh } = sheet.sheet_geometry;

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
    <div className="flex h-full w-full items-center justify-center">
      <div
        className="relative max-h-full max-w-full"
        style={{ aspectRatio: `${sw} / ${sh}`, width: sw, height: sh }}
      >
        {sheet.crops.map((crop, index) => (
          <ComposedCrop
            key={`crop-${index}`}
            crop={crop}
            sheetWidth={sw}
            sheetHeight={sh}
          />
        ))}
      </div>
    </div>
  );
}

// ── ComposedCrop — one absolutely-positioned crop image ──────────────────────

interface ComposedCropProps {
  crop: RemixCrop;
  sheetWidth: number;
  sheetHeight: number;
}

/** A single crop placed at `geometry / sheet_geometry * 100%`. Keeps its own
 *  error state so a 404 shows a per-crop placeholder without breaking siblings. */
function ComposedCrop({ crop, sheetWidth, sheetHeight }: ComposedCropProps) {
  const [errored, setErrored] = useState(false);
  const { x, y, w, h } = crop.geometry;

  const boxStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${(x / sheetWidth) * 100}%`,
    top: `${(y / sheetHeight) * 100}%`,
    width: `${(w / sheetWidth) * 100}%`,
    height: `${(h / sheetHeight) * 100}%`,
    zIndex: crop['z-index'],
  };

  if (errored) {
    return (
      <div
        style={boxStyle}
        className="flex flex-col items-center justify-center gap-1 bg-muted"
      >
        <ImageOff className="h-6 w-6 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">Ảnh lỗi</span>
      </div>
    );
  }

  return (
    <img
      src={crop.media_url}
      alt={crop.name || 'Crop'}
      style={boxStyle}
      onError={() => {
        log.warn('ComposedCrop', 'crop image failed to load', {
          // Log only the path tail — full URL may carry signed tokens (PII).
          urlTail: crop.media_url.slice(crop.media_url.lastIndexOf('/') + 1),
        });
        setErrored(true);
      }}
      className="object-contain"
    />
  );
}
