// generate-canvas.tsx — Center canvas (design §3.3): zoom header + checkerboard preview
// of the selected illustration, with the busy overlay and the Upload-mode dropzone.
// Presentational/dumb — zoom value + drop handler come from the root.

import { useCallback, useState } from 'react';
import { Loader2, UploadCloud } from 'lucide-react';
import { cn } from '@/utils/utils';
import { createLogger } from '@/utils/logger';
import type { Illustration } from '@/types/prop-types';
import type { GenerateModalMode } from './generate-image-modal-constants';
import { ZOOM } from './generate-image-modal-constants';
import { HEADER_HEIGHT_PX } from '../../remix-creative-space/swap-crop-sheet-modal/swap-modal-constants';
import { ZoomControl } from '../zoom-control';

const log = createLogger('Editor', 'GenerateCanvas');

// Dark checkerboard so transparent PNGs read correctly (design §4.3, cell ~12px).
const CHECKERBOARD_STYLE: React.CSSProperties = {
  backgroundColor: '#0e1220',
  backgroundImage:
    'linear-gradient(45deg, #141a2c 25%, transparent 25%), linear-gradient(-45deg, #141a2c 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #141a2c 75%), linear-gradient(-45deg, transparent 75%, #141a2c 75%)',
  backgroundSize: '24px 24px',
  backgroundPosition: '0 0, 0 12px, 12px -12px, -12px 0',
};

interface GenerateCanvasProps {
  selected: Illustration | null;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  mode: GenerateModalMode;
  isProcessing: boolean;
  isUploading: boolean;
  /** Upload-mode only: files dropped onto the canvas. */
  onDropFiles: (files: FileList) => void;
}

export function GenerateCanvas({
  selected,
  zoomLevel,
  onZoomChange,
  mode,
  isProcessing,
  isUploading,
  onDropFiles,
}: GenerateCanvasProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const isUploadMode = mode === 'upload';
  const busy = isProcessing || isUploading;

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!isUploadMode) return;
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        log.debug('handleDrop', 'files dropped on canvas', { count: files.length });
        onDropFiles(files);
      }
    },
    [isUploadMode, onDropFiles],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[var(--swap-modal-canvas-bg)]">
      {/* stage-header: spacer + zoom control */}
      <div
        className="flex shrink-0 items-center justify-end gap-2 border-b border-[var(--swap-modal-border)] px-4"
        style={{ height: HEADER_HEIGHT_PX }}
      >
        <ZoomControl
          value={zoomLevel}
          onChange={onZoomChange}
          min={ZOOM.min}
          max={ZOOM.max}
          step={ZOOM.step}
        />
      </div>

      {/* canvas */}
      <div
        className={cn(
          'relative flex flex-1 items-center justify-center overflow-auto p-6',
          isUploadMode && isDragOver && 'ring-2 ring-inset ring-[var(--swap-modal-accent)]',
        )}
        style={CHECKERBOARD_STYLE}
        onDragOver={
          isUploadMode
            ? (e) => {
                e.preventDefault();
                setIsDragOver(true);
              }
            : undefined
        }
        onDragLeave={isUploadMode ? () => setIsDragOver(false) : undefined}
        onDrop={isUploadMode ? handleDrop : undefined}
      >
        {selected ? (
          <img
            key={selected.media_url}
            src={selected.media_url}
            alt="Selected illustration"
            className="object-contain"
            style={{ width: `${zoomLevel}%`, maxWidth: 'none', height: 'auto' }}
          />
        ) : isUploadMode ? (
          <div className="flex flex-col items-center gap-3 text-[var(--swap-modal-text-muted)]">
            <UploadCloud className="h-10 w-10" aria-hidden="true" />
            <p className="text-sm">Click [+] or drag &amp; drop an image here</p>
          </div>
        ) : (
          <p className="text-sm text-[var(--swap-modal-text-muted)]">No images generated</p>
        )}

        {busy && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60"
          >
            <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden="true" />
            <p className="text-sm text-white">
              {isUploading ? 'Uploading…' : 'Generating…'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
