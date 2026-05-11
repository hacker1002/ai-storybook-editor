// motion-line-overlay.tsx — SVG overlay for editing Lines (effect type 16) motion path on canvas.
//
// Render: blue shaft from item center → tip + filled arrow triangle + outer ring.
// Drag tip to move destination; commit writes back self-healed w/h on pointerup.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createLogger } from '@/utils/logger';
import {
  MOTION_LINE_OVERLAY,
  applySelfHeal,
  computeBaseCenterPct,
  computeTipCenterPct,
  isDegenerate,
  pctToPx,
  pxToPctDelta,
  shaftAngleRad,
  tipCenterToTopLeft,
  type ItemGeometry,
  type MotionLineGeometry,
} from './motion-line-overlay-utils';

export type { MotionLineGeometry, ItemGeometry } from './motion-line-overlay-utils';

const log = createLogger('Editor', 'MotionLineOverlay');

export interface MotionLineOverlayProps {
  geometry: MotionLineGeometry;
  itemGeometry: ItemGeometry | null;
  spreadWidthPx: number;
  spreadHeightPx: number;
  label: string;
  isSelected: boolean;
  onChange: (next: MotionLineGeometry) => void;
  onCommit: (final: MotionLineGeometry) => void;
  onSelect?: () => void;
}

type Mode = 'idle' | 'drag-tip';

interface InternalState {
  mode: Mode;
  pointerStartPx: { x: number; y: number };
  geometryAtStart: MotionLineGeometry;
}

const INITIAL_STATE: InternalState = {
  mode: 'idle',
  pointerStartPx: { x: 0, y: 0 },
  geometryAtStart: { x: 0, y: 0, w: 0, h: 0 },
};

export function MotionLineOverlay({
  geometry,
  itemGeometry,
  spreadWidthPx,
  spreadHeightPx,
  label,
  isSelected,
  onChange,
  onCommit,
  onSelect,
}: MotionLineOverlayProps) {
  const [state, setState] = useState<InternalState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Keep latest geometry available for commit on pointerup (state may hold stale closure).
  const latestGeometryRef = useRef(geometry);
  latestGeometryRef.current = geometry;

  // Stable refs for itemGeometry + callbacks so the drag effect doesn't tear down
  // and re-attach window listeners on every parent re-render mid-drag.
  const itemGeometryRef = useRef(itemGeometry);
  itemGeometryRef.current = itemGeometry;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const basePx = useMemo(() => {
    if (!itemGeometry) return null;
    const baseCenterPct = computeBaseCenterPct(itemGeometry);
    return pctToPx(baseCenterPct, spreadWidthPx, spreadHeightPx);
  }, [itemGeometry, spreadWidthPx, spreadHeightPx]);

  const tipPx = useMemo(() => {
    const tipCenterPct = computeTipCenterPct(geometry);
    return pctToPx(tipCenterPct, spreadWidthPx, spreadHeightPx);
  }, [geometry, spreadWidthPx, spreadHeightPx]);

  // Window-level pointermove/up listeners during drag.
  useEffect(() => {
    if (state.mode === 'idle') return;

    function handleMove(e: PointerEvent) {
      const s = stateRef.current;
      if (s.mode !== 'drag-tip') return;
      const item = itemGeometryRef.current;
      if (!item) return;
      const deltaPx = {
        x: e.clientX - s.pointerStartPx.x,
        y: e.clientY - s.pointerStartPx.y,
      };
      const deltaPct = pxToPctDelta(deltaPx, spreadWidthPx, spreadHeightPx);
      const startTipCenter = computeTipCenterPct(s.geometryAtStart);
      const newTipCenter = {
        x: startTipCenter.x + deltaPct.x,
        y: startTipCenter.y + deltaPct.y,
      };
      const newTopLeft = tipCenterToTopLeft(newTipCenter, item.w, item.h);
      const next: MotionLineGeometry = {
        x: newTopLeft.x,
        y: newTopLeft.y,
        w: item.w,
        h: item.h,
      };
      latestGeometryRef.current = next;
      onChangeRef.current(next);
    }

    function handleUp() {
      const s = stateRef.current;
      if (s.mode !== 'drag-tip') {
        setState(INITIAL_STATE);
        return;
      }
      const item = itemGeometryRef.current;
      if (!item) {
        log.warn('handlePointerUp', 'item geometry vanished mid-drag', { label });
        setState(INITIAL_STATE);
        return;
      }
      const finalGeometry = applySelfHeal(latestGeometryRef.current, item);
      setState(INITIAL_STATE);
      if (isDegenerate(finalGeometry, item)) {
        log.debug('handlePointerUp', 'degenerate — skip commit', {
          label,
          x: finalGeometry.x,
          y: finalGeometry.y,
        });
        return;
      }
      log.info('handlePointerUp', 'commit', {
        label,
        x: finalGeometry.x,
        y: finalGeometry.y,
      });
      onCommitRef.current(finalGeometry);
    }

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [state.mode, spreadWidthPx, spreadHeightPx, label]);

  if (!itemGeometry) {
    log.debug('render', 'orphan target — skip', { label });
    return null;
  }
  if (!basePx) return null;

  function handleTipPointerDown(e: React.PointerEvent<SVGCircleElement>) {
    if (!isSelected) {
      onSelect?.();
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    log.info('handleTipPointerDown', 'start drag-tip', { label });
    setState({
      mode: 'drag-tip',
      pointerStartPx: { x: e.clientX, y: e.clientY },
      geometryAtStart: latestGeometryRef.current,
    });
  }

  const shaftWidth = isSelected
    ? MOTION_LINE_OVERLAY.SHAFT_WIDTH_SELECTED_PX
    : MOTION_LINE_OVERLAY.SHAFT_WIDTH_UNSELECTED_PX;
  const shaftDash = isSelected ? undefined : '4 4';

  // Triangle apex along (base→tip) angle, anchored at tipPx.
  const angleRad = shaftAngleRad(basePx, tipPx);
  const triLen = MOTION_LINE_OVERLAY.TIP_TRIANGLE_LENGTH_PX;
  const triHalfBase = MOTION_LINE_OVERLAY.TIP_TRIANGLE_HALF_BASE_PX;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  // Base of triangle is centered slightly behind the tip so the apex sits on tip.
  const baseCenterX = tipPx.x - cosA * (triLen * 0.4);
  const baseCenterY = tipPx.y - sinA * (triLen * 0.4);
  const apexX = baseCenterX + cosA * triLen;
  const apexY = baseCenterY + sinA * triLen;
  // Perpendicular for base corners.
  const perpX = -sinA;
  const perpY = cosA;
  const baseLeftX = baseCenterX + perpX * triHalfBase;
  const baseLeftY = baseCenterY + perpY * triHalfBase;
  const baseRightX = baseCenterX - perpX * triHalfBase;
  const baseRightY = baseCenterY - perpY * triHalfBase;
  const trianglePoints = `${apexX},${apexY} ${baseLeftX},${baseLeftY} ${baseRightX},${baseRightY}`;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: spreadWidthPx, height: spreadHeightPx, zIndex: 900, overflow: 'visible' }}
      role="application"
      aria-label={`Motion line, destination x=${geometry.x.toFixed(1)}%, y=${geometry.y.toFixed(1)}%`}
    >
      {/* Shaft */}
      <line
        x1={basePx.x}
        y1={basePx.y}
        x2={tipPx.x}
        y2={tipPx.y}
        stroke={MOTION_LINE_OVERLAY.SHAFT_COLOR}
        strokeWidth={shaftWidth}
        strokeDasharray={shaftDash}
        strokeLinecap="round"
        style={{ pointerEvents: 'none' }}
      />

      {/* Outer ring (visual hint) */}
      <circle
        cx={tipPx.x}
        cy={tipPx.y}
        r={MOTION_LINE_OVERLAY.TIP_OUTER_RING_RADIUS_PX}
        fill="none"
        stroke={MOTION_LINE_OVERLAY.RING_STROKE_COLOR}
        strokeWidth={MOTION_LINE_OVERLAY.RING_STROKE_WIDTH_PX}
        style={{ pointerEvents: 'none' }}
      />

      {/* Filled triangle tip */}
      <polygon
        points={trianglePoints}
        fill={MOTION_LINE_OVERLAY.SHAFT_COLOR}
        style={{ pointerEvents: 'none' }}
      />

      {/* Hit area — invisible larger circle on top, captures pointer */}
      <circle
        cx={tipPx.x}
        cy={tipPx.y}
        r={MOTION_LINE_OVERLAY.TIP_OUTER_RING_RADIUS_PX + MOTION_LINE_OVERLAY.HIT_SLOP_PX}
        fill="transparent"
        style={{
          pointerEvents: 'all',
          cursor: state.mode === 'drag-tip' ? 'grabbing' : 'grab',
        }}
        onPointerDown={handleTipPointerDown}
      />

      {/* Label pill */}
      <MotionLineLabel
        tipX={tipPx.x}
        tipY={tipPx.y}
        text={label}
        isSelected={isSelected}
      />
    </svg>
  );
}

interface MotionLineLabelProps {
  tipX: number;
  tipY: number;
  text: string;
  isSelected: boolean;
}

const APPROX_CHAR_WIDTH_PX = 7;

function MotionLineLabel({ tipX, tipY, text, isSelected }: MotionLineLabelProps) {
  const padX = MOTION_LINE_OVERLAY.LABEL_PADDING_X;
  const padY = MOTION_LINE_OVERLAY.LABEL_PADDING_Y;
  const fontSize = MOTION_LINE_OVERLAY.LABEL_FONT_SIZE_PX;
  const textWidth = text.length * APPROX_CHAR_WIDTH_PX;
  const pillWidth = textWidth + padX * 2;
  const pillHeight = fontSize + padY * 2;
  // Position pill above-right of tip (offset from outer ring).
  const offset = MOTION_LINE_OVERLAY.LABEL_OFFSET_PX;
  const pillX = tipX + offset;
  const pillY = Math.max(0, tipY - pillHeight - offset);

  if (!isSelected) {
    return (
      <text
        x={pillX}
        y={pillY + pillHeight - padY - 1}
        fill={MOTION_LINE_OVERLAY.SHAFT_COLOR}
        fontSize={fontSize}
        fontWeight={600}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {text}
      </text>
    );
  }

  return (
    <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <rect
        x={pillX}
        y={pillY}
        width={pillWidth}
        height={pillHeight}
        rx={MOTION_LINE_OVERLAY.LABEL_RADIUS}
        fill={MOTION_LINE_OVERLAY.LABEL_BG_COLOR}
      />
      <text
        x={pillX + padX}
        y={pillY + pillHeight - padY - 1}
        fill={MOTION_LINE_OVERLAY.LABEL_TEXT_COLOR}
        fontSize={fontSize}
        fontWeight={600}
      >
        {text}
      </text>
    </g>
  );
}
