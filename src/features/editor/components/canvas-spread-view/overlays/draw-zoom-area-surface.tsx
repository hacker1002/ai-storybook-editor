// draw-zoom-area-surface.tsx — Crosshair drawing surface for initial Camera Zoom area creation.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createLogger } from '@/utils/logger';
import {
  ZOOM_OVERLAY,
  buildDefaultZoomGeometry,
  clampToBounds,
  drawRectFromPointers,
  enforceMinSize,
  type ZoomAreaGeometry,
} from './zoom-area-overlay-utils';

const log = createLogger('Editor', 'DrawZoomAreaSurface');

export interface DrawZoomAreaSurfaceProps {
  spreadWidthPx: number;
  spreadHeightPx: number;
  spreadRatio: number;
  onComplete: (geometry: ZoomAreaGeometry) => void;
  onCancel: () => void;
}

interface InternalState {
  isDrawing: boolean;
  startPx: { x: number; y: number } | null;
  currentPx: { x: number; y: number } | null;
}

const INITIAL_STATE: InternalState = { isDrawing: false, startPx: null, currentPx: null };

export function DrawZoomAreaSurface({
  spreadWidthPx,
  spreadHeightPx,
  spreadRatio,
  onComplete,
  onCancel,
}: DrawZoomAreaSurfaceProps) {
  const [state, setState] = useState<InternalState>(INITIAL_STATE);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Document-level Escape listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        log.info('handleKeyDown', 'cancel drawing', {});
        e.preventDefault();
        setState(INITIAL_STATE);
        onCancelRef.current();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function pxToPct(p: { x: number; y: number }) {
    return {
      x: spreadWidthPx > 0 ? (p.x / spreadWidthPx) * 100 : 0,
      y: spreadHeightPx > 0 ? (p.y / spreadHeightPx) * 100 : 0,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    log.info('handlePointerDown', 'start drawing', {});
    const rect = e.currentTarget.getBoundingClientRect();
    const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setState({ isDrawing: true, startPx: px, currentPx: px });
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!state.isDrawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setState((prev) => ({ ...prev, currentPx: px }));
  }

  function handlePointerUp() {
    if (!state.isDrawing || !state.startPx || !state.currentPx) {
      log.warn('handlePointerUp', 'no drawing state', {});
      return;
    }
    const startPct = pxToPct(state.startPx);
    const currentPct = pxToPct(state.currentPx);
    const dragDx = Math.abs(currentPct.x - startPct.x);
    const dragDy = Math.abs(currentPct.y - startPct.y);

    let geometry: ZoomAreaGeometry;
    if (dragDx < ZOOM_OVERLAY.MIN_DRAG_SIZE_PCT && dragDy < ZOOM_OVERLAY.MIN_DRAG_SIZE_PCT) {
      log.info('handlePointerUp', 'click only — using default geometry', {});
      geometry = buildDefaultZoomGeometry(spreadRatio);
    } else {
      log.info('handlePointerUp', 'drag complete', { dragDx, dragDy });
      geometry = drawRectFromPointers(startPct, currentPct, spreadRatio);
      geometry = enforceMinSize(geometry, spreadRatio);
      geometry = clampToBounds(geometry);
    }

    setState(INITIAL_STATE);
    onComplete(geometry);
  }

  const previewRectPx = useMemo(() => {
    if (!state.startPx || !state.currentPx) return null;
    const startPct = pxToPct(state.startPx);
    const currentPct = pxToPct(state.currentPx);
    const g = drawRectFromPointers(startPct, currentPct, spreadRatio);
    return {
      left: (g.x / 100) * spreadWidthPx,
      top: (g.y / 100) * spreadHeightPx,
      width: (g.w / 100) * spreadWidthPx,
      height: (g.h / 100) * spreadHeightPx,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.startPx, state.currentPx, spreadRatio, spreadWidthPx, spreadHeightPx]);

  return (
    <div
      className="absolute inset-0 z-50"
      style={{ cursor: 'crosshair', width: spreadWidthPx, height: spreadHeightPx }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {previewRectPx && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={spreadWidthPx}
          height={spreadHeightPx}
        >
          <rect
            x={previewRectPx.left}
            y={previewRectPx.top}
            width={previewRectPx.width}
            height={previewRectPx.height}
            fill="rgba(33, 150, 243, 0.1)"
            stroke={ZOOM_OVERLAY.COLOR}
            strokeWidth={ZOOM_OVERLAY.BORDER_WIDTH_PX}
            strokeDasharray="4 4"
          />
        </svg>
      )}
    </div>
  );
}
