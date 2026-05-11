// zoom-area-overlay.tsx — SVG overlay for editing Camera Zoom geometry on canvas.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createLogger } from '@/utils/logger';
import {
  HANDLE_IDS,
  ZOOM_OVERLAY,
  clampToBounds,
  computeMove,
  computeResize,
  cursorFor,
  enforceMinSize,
  handlePosition,
  type HandleId,
  type RectPx,
  type ZoomAreaGeometry,
} from './zoom-area-overlay-utils';

export type { ZoomAreaGeometry, HandleId } from './zoom-area-overlay-utils';

const log = createLogger('Editor', 'ZoomAreaOverlay');

export interface ZoomAreaOverlayProps {
  geometry: ZoomAreaGeometry;
  spreadWidthPx: number;
  spreadHeightPx: number;
  spreadRatio: number;
  label: string;
  isSelected: boolean;
  onChange: (next: ZoomAreaGeometry) => void;
  onCommit: (final: ZoomAreaGeometry) => void;
  onSelect?: () => void;
}

type Mode = 'idle' | 'drag-move' | 'drag-resize';

interface InternalState {
  mode: Mode;
  activeHandle: HandleId | null;
  pointerStartPx: { x: number; y: number };
  geometryAtStart: ZoomAreaGeometry;
}

const INITIAL_STATE: InternalState = {
  mode: 'idle',
  activeHandle: null,
  pointerStartPx: { x: 0, y: 0 },
  geometryAtStart: { x: 0, y: 0, w: 0, h: 0 },
};

export function ZoomAreaOverlay({
  geometry,
  spreadWidthPx,
  spreadHeightPx,
  spreadRatio,
  label,
  isSelected,
  onChange,
  onCommit,
  onSelect,
}: ZoomAreaOverlayProps) {
  const [state, setState] = useState<InternalState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Keep latest geometry available for commit on pointerup (state.geometry might be stale closure)
  const latestGeometryRef = useRef(geometry);
  latestGeometryRef.current = geometry;

  const rectPx: RectPx = useMemo(
    () => ({
      left: (geometry.x / 100) * spreadWidthPx,
      top: (geometry.y / 100) * spreadHeightPx,
      width: (geometry.w / 100) * spreadWidthPx,
      height: (geometry.h / 100) * spreadHeightPx,
    }),
    [geometry, spreadWidthPx, spreadHeightPx],
  );

  // Window-level move/up listeners (set up at drag start, cleaned up on idle)
  useEffect(() => {
    if (state.mode === 'idle') return;

    function handleMove(e: PointerEvent) {
      const s = stateRef.current;
      if (s.mode === 'idle') return;
      const pCurrent = { x: e.clientX, y: e.clientY };
      let next: ZoomAreaGeometry;
      if (s.mode === 'drag-move') {
        next = computeMove(s.geometryAtStart, s.pointerStartPx, pCurrent, spreadWidthPx, spreadHeightPx);
      } else if (s.mode === 'drag-resize' && s.activeHandle) {
        next = computeResize(
          s.activeHandle,
          s.geometryAtStart,
          s.pointerStartPx,
          pCurrent,
          spreadWidthPx,
          spreadHeightPx,
          spreadRatio,
        );
      } else {
        return;
      }
      log.debug('handlePointerMove', 'preview', { mode: s.mode, w: next.w, h: next.h });
      latestGeometryRef.current = next;
      onChange(next);
    }

    function handleUp() {
      const s = stateRef.current;
      log.info('handlePointerUp', 'commit', { mode: s.mode });
      onCommit(latestGeometryRef.current);
      setState(INITIAL_STATE);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [state.mode, spreadWidthPx, spreadHeightPx, spreadRatio, onChange, onCommit]);

  function handleBodyPointerDown(e: React.PointerEvent<SVGRectElement>) {
    if (!isSelected) {
      log.info('handleBodyPointerDown', 'select first', {});
      onSelect?.();
      return;
    }
    e.stopPropagation();
    setState({
      mode: 'drag-move',
      activeHandle: null,
      pointerStartPx: { x: e.clientX, y: e.clientY },
      geometryAtStart: geometry,
    });
  }

  function handleHandlePointerDown(handleId: HandleId, e: React.PointerEvent<SVGCircleElement>) {
    e.stopPropagation();
    log.info('handleHandlePointerDown', 'resize start', { handleId });
    setState({
      mode: 'drag-resize',
      activeHandle: handleId,
      pointerStartPx: { x: e.clientX, y: e.clientY },
      geometryAtStart: geometry,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    if (!isSelected) return;
    const step = e.shiftKey ? 5 : 1;

    if (e.ctrlKey || e.metaKey) {
      // Resize via arrows: width drives, height reflows
      let next: ZoomAreaGeometry | null = null;
      if (e.key === 'ArrowRight') {
        const newW = geometry.w + step;
        next = enforceMinSize({ ...geometry, w: newW, h: newW / spreadRatio }, spreadRatio);
      } else if (e.key === 'ArrowLeft') {
        const newW = Math.max(ZOOM_OVERLAY.MIN_ZOOM_AREA_PCT, geometry.w - step);
        next = enforceMinSize({ ...geometry, w: newW, h: newW / spreadRatio }, spreadRatio);
      }
      if (next) {
        next = clampToBounds(next);
        e.preventDefault();
        onChange(next);
        onCommit(next);
      }
      return;
    }

    let next: ZoomAreaGeometry | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        next = { ...geometry, x: Math.max(0, geometry.x - step) };
        break;
      case 'ArrowRight':
        next = { ...geometry, x: Math.min(100 - geometry.w, geometry.x + step) };
        break;
      case 'ArrowUp':
        next = { ...geometry, y: Math.max(0, geometry.y - step) };
        break;
      case 'ArrowDown':
        next = { ...geometry, y: Math.min(100 - geometry.h, geometry.y + step) };
        break;
    }
    if (next) {
      e.preventDefault();
      onChange(next);
      onCommit(next);
    }
  }

  const showLiveDimensions = state.mode !== 'idle';
  const cursor = isSelected ? 'move' : 'pointer';

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      // zIndex above max item layer (textbox max=700) and matching SelectionOverlay (900),
      // so the rect + handles capture pointer events when items overlap the area.
      style={{ width: spreadWidthPx, height: spreadHeightPx, zIndex: 900 }}
      tabIndex={isSelected ? 0 : -1}
      onKeyDown={handleKeyDown}
      role="application"
      aria-label={`Camera Zoom area, x=${geometry.x.toFixed(1)}%, y=${geometry.y.toFixed(1)}%, width=${geometry.w.toFixed(1)}%`}
    >
      {/* Body (border) — pointer-events all to capture drag */}
      <rect
        x={rectPx.left}
        y={rectPx.top}
        width={rectPx.width}
        height={rectPx.height}
        fill={isSelected ? ZOOM_OVERLAY.FILL_SELECTED : ZOOM_OVERLAY.FILL_UNSELECTED}
        stroke={ZOOM_OVERLAY.COLOR}
        strokeWidth={isSelected ? ZOOM_OVERLAY.BORDER_WIDTH_SELECTED_PX : ZOOM_OVERLAY.BORDER_WIDTH_PX}
        strokeDasharray={isSelected ? undefined : '4 4'}
        style={{ pointerEvents: 'all', cursor }}
        onPointerDown={handleBodyPointerDown}
      />

      {/* Label pill — camera icon + text on dark background, like a tag */}
      <ZoomLabel
        x={rectPx.left}
        topY={rectPx.top}
        text={label}
        liveDimensions={
          showLiveDimensions ? `${geometry.w.toFixed(1)}% × ${geometry.h.toFixed(1)}%` : null
        }
        isSelected={isSelected}
      />

      {/* 8 handles — only when selected */}
      {isSelected &&
        HANDLE_IDS.map((id) => {
          const { cx, cy } = handlePosition(id, rectPx);
          return (
            <circle
              key={id}
              cx={cx}
              cy={cy}
              r={ZOOM_OVERLAY.HANDLE_RADIUS_SELECTED_PX}
              fill={ZOOM_OVERLAY.COLOR}
              stroke="white"
              strokeWidth={2}
              style={{ pointerEvents: 'all', cursor: cursorFor(id) }}
              onPointerDown={(e) => handleHandlePointerDown(id, e)}
            />
          );
        })}
    </svg>
  );
}

interface ZoomLabelProps {
  x: number;
  topY: number;
  text: string;
  liveDimensions: string | null;
  isSelected: boolean;
}

// Approx char width ratio for the label font (12px sans-serif, weight 600).
// Used only to size the background pill — actual `<text>` is auto-rendered
// by the browser, so a small over/under-estimate just leaves extra padding.
const APPROX_CHAR_WIDTH_PX = 7;
const ICON_WIDTH_PX = 18; // camera emoji width @ 12px font

function ZoomLabel({ x, topY, text, liveDimensions, isSelected }: ZoomLabelProps) {
  const display = `📷 ${text}${liveDimensions ? `  ${liveDimensions}` : ''}`;
  const textWidth = display.length * APPROX_CHAR_WIDTH_PX + ICON_WIDTH_PX * 0.4;
  const padX = ZOOM_OVERLAY.LABEL_PADDING_X;
  const padY = ZOOM_OVERLAY.LABEL_PADDING_Y;
  const fontSize = ZOOM_OVERLAY.LABEL_FONT_SIZE_PX;
  const pillHeight = fontSize + padY * 2;
  // Position pill ABOVE the rect (top edge), or just inside if no room
  const pillY = Math.max(0, topY - pillHeight - 2);
  // Unselected → keep dashed-outline look without pill bg (lighter affordance)
  if (!isSelected) {
    return (
      <text
        x={x}
        y={Math.max(12, topY - 6)}
        fill={ZOOM_OVERLAY.COLOR}
        fontSize={fontSize}
        fontWeight={600}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {display}
      </text>
    );
  }
  return (
    <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <rect
        x={x}
        y={pillY}
        width={textWidth + padX * 2}
        height={pillHeight}
        rx={ZOOM_OVERLAY.LABEL_RADIUS}
        fill={ZOOM_OVERLAY.LABEL_BG_COLOR}
      />
      <text
        x={x + padX}
        y={pillY + pillHeight - padY - 1}
        fill={ZOOM_OVERLAY.LABEL_TEXT_COLOR}
        fontSize={fontSize}
        fontWeight={600}
      >
        {display}
      </text>
    </g>
  );
}
