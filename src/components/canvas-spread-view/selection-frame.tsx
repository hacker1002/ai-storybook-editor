// selection-frame.tsx - Selection overlay with drag/resize using react-moveable
'use client';

import { useRef, useEffect } from 'react';
import Moveable from 'react-moveable';
import type { Geometry, Point, ResizeHandle } from './types';

interface SelectionFrameProps {
  geometry: Geometry;
  zoomLevel: number;
  showHandles: boolean;
  activeHandle: ResizeHandle | null;

  // Feature flags
  canDrag?: boolean;
  canResize?: boolean;

  // Drag callbacks
  onDragStart: () => void;
  onDrag: (delta: Point) => void;
  onDragEnd: () => void;

  // Resize callbacks
  onResizeStart: (handle: ResizeHandle) => void;
  onResize: (handle: ResizeHandle, delta: Point) => void;
  onResizeEnd: () => void;
}

export function SelectionFrame({
  geometry,
  showHandles,
  canDrag = true,
  canResize = true,
  onDragStart,
  onDrag,
  onDragEnd,
  onResizeStart,
  onResize,
  onResizeEnd,
}: SelectionFrameProps) {
  const targetRef = useRef<HTMLDivElement>(null);
  const moveableRef = useRef<Moveable>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const startGeometryRef = useRef<Geometry | null>(null);

  // Get container dimensions for percentage calculations
  useEffect(() => {
    containerRef.current = targetRef.current?.parentElement ?? null;
  }, []);

  // Update moveable when geometry changes from external source
  useEffect(() => {
    moveableRef.current?.updateRect();
  }, [geometry]);

  // Convert pixel delta to percentage delta
  const toPercentDelta = (dx: number, dy: number): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (dx / rect.width) * 100,
      y: (dy / rect.height) * 100,
    };
  };

  // Map moveable direction to our handle type
  const directionToHandle = (direction: number[]): ResizeHandle => {
    const [h, v] = direction;
    if (v === -1 && h === -1) return 'nw';
    if (v === -1 && h === 0) return 'n';
    if (v === -1 && h === 1) return 'ne';
    if (v === 0 && h === -1) return 'w';
    if (v === 0 && h === 1) return 'e';
    if (v === 1 && h === -1) return 'sw';
    if (v === 1 && h === 0) return 's';
    return 'se';
  };

  // Border width for drag zone (pixels)
  const DRAG_BORDER_WIDTH = 20;

  return (
    <>
      {/* Frame container - only the border area captures drag events */}
      <div
        ref={targetRef}
        className="absolute"
        style={{
          left: `${geometry.x}%`,
          top: `${geometry.y}%`,
          width: `${geometry.w}%`,
          height: `${geometry.h}%`,
          zIndex: 10000,
          pointerEvents: 'none',
        }}
      >
        {/* Top edge */}
        <div
          className="absolute left-0 right-0 top-0 cursor-move"
          style={{ height: DRAG_BORDER_WIDTH, pointerEvents: 'auto' }}
        />
        {/* Bottom edge */}
        <div
          className="absolute left-0 right-0 bottom-0 cursor-move"
          style={{ height: DRAG_BORDER_WIDTH, pointerEvents: 'auto' }}
        />
        {/* Left edge */}
        <div
          className="absolute left-0 top-0 bottom-0 cursor-move"
          style={{ width: DRAG_BORDER_WIDTH, pointerEvents: 'auto' }}
        />
        {/* Right edge */}
        <div
          className="absolute right-0 top-0 bottom-0 cursor-move"
          style={{ width: DRAG_BORDER_WIDTH, pointerEvents: 'auto' }}
        />
        {/* Visual border */}
        <div
          className="absolute inset-0 border-2 border-blue-500 pointer-events-none"
          style={{ boxSizing: 'border-box' }}
        />
      </div>

      {/* Moveable controller */}
      <Moveable
        ref={moveableRef}
        target={targetRef}
        draggable={canDrag}
        resizable={canResize && showHandles}
        throttleDrag={0}
        throttleResize={0}
        edge={false}
        keepRatio={false}
        origin={false}
        padding={{ left: 0, top: 0, right: 0, bottom: 0 }}
        renderDirections={['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']}
        className="moveable-selection"
        // Drag events - use dist (cumulative) not delta (per-frame)
        onDragStart={() => {
          startGeometryRef.current = { ...geometry };
          onDragStart();
        }}
        onDrag={({ dist }) => {
          const percentDelta = toPercentDelta(dist[0], dist[1]);
          onDrag(percentDelta);
        }}
        onDragEnd={() => {
          startGeometryRef.current = null;
          onDragEnd();
        }}
        // Resize events - use dist (cumulative) not delta (per-frame)
        onResizeStart={({ direction }) => {
          startGeometryRef.current = { ...geometry };
          onResizeStart(directionToHandle(direction));
        }}
        onResize={({ direction, dist }) => {
          const handle = directionToHandle(direction);
          const percentDelta = toPercentDelta(dist[0], dist[1]);
          onResize(handle, percentDelta);
        }}
        onResizeEnd={() => {
          startGeometryRef.current = null;
          onResizeEnd();
        }}
      />
    </>
  );
}

export default SelectionFrame;
